import fs from "node:fs/promises";
import path from "node:path";
import {
  assertPathInsideRoot,
  ensureDir,
  findNearestExistingAncestor,
  isPathInsideRoot,
  realpathOrNull
} from "../../../shared/src/index.js";
import type { AppConfig, AppLogger } from "../../../shared/src/index.js";
import { AppError } from "../errors/index.js";
import type { SafePathInfo, SandboxStatus } from "../types/index.js";

type ResolveSandboxPathOptions = {
  expectedType: "file" | "directory" | "any";
  mustExist: boolean;
  writeIntent?: boolean;
};

export class SandboxService {
  private activeScopePath: string;
  private rootRealPath = "";
  private storageRealPath = "";
  private tempRealPath = "";

  constructor(
    private readonly config: AppConfig,
    private readonly logger: AppLogger
  ) {
    this.activeScopePath = config.shelbyWorkdir;
  }

  async initialize(): Promise<void> {
    await ensureDir(this.config.shelbyWorkdir);
    await ensureDir(this.config.shelbyStorageDir);
    await ensureDir(this.config.tempDir);

    this.rootRealPath = (await fs.realpath(this.config.shelbyWorkdir)) ?? this.config.shelbyWorkdir;
    this.storageRealPath =
      (await fs.realpath(this.config.shelbyStorageDir)) ?? this.config.shelbyStorageDir;
    this.tempRealPath = (await fs.realpath(this.config.tempDir)) ?? this.config.tempDir;
  }

  async setSafePath(inputPath: string): Promise<SafePathInfo> {
    const resolvedPath = await this.resolveWithinScope(inputPath, {
      expectedType: "directory",
      mustExist: true
    });

    this.activeScopePath = resolvedPath;
    const safePath = this.toRelativeScope(this.activeScopePath);

    this.logger.info(
      {
        activeScopePath: this.activeScopePath,
        safePath
      },
      "Sandbox safe path narrowed.",
      { notifyClient: true }
    );

    return {
      ok: true,
      safePath,
      resolvedPath,
      rootPath: this.config.shelbyWorkdir,
      effectiveScope: this.toRelativeScope(this.activeScopePath)
    };
  }

  getStatus(): SandboxStatus {
    return {
      rootPath: this.config.shelbyWorkdir,
      activeScopePath: this.activeScopePath,
      effectiveScope: this.toRelativeScope(this.activeScopePath),
      storageDir: this.config.shelbyStorageDir,
      tempDir: this.config.tempDir,
      maxUploadSizeMb: this.config.maxUploadSizeMb,
      maxReadTextBytes: this.config.maxReadTextBytes,
      allowDestructiveTools: this.config.allowDestructiveTools,
      restrictions: [
        "All agent file access is confined to SHELBY_WORKDIR.",
        "Active safe path can only narrow further; it never widens at runtime.",
        "Reserved internal directories are blocked from direct agent access.",
        "Symlink escapes are rejected by real-path validation."
      ]
    };
  }

  async resolveInputFile(inputPath: string): Promise<string> {
    return this.resolveWithinScope(inputPath, {
      expectedType: "file",
      mustExist: true
    });
  }

  async resolveInputDirectory(inputPath: string): Promise<string> {
    return this.resolveWithinScope(inputPath, {
      expectedType: "directory",
      mustExist: true
    });
  }

  async resolveOutputFile(inputPath: string): Promise<string> {
    return this.resolveWithinScope(inputPath, {
      expectedType: "file",
      mustExist: false,
      writeIntent: true
    });
  }

  async getDefaultDownloadPath(fileName: string): Promise<string> {
    return this.resolveOutputFile(path.join("downloads", fileName));
  }

  isReservedPath(targetPath: string): boolean {
    const resolvedTarget = path.resolve(targetPath);
    const reservedRoots = new Set([
      this.config.shelbyStorageDir,
      this.config.tempDir,
      path.dirname(this.config.shelbyStorageDir),
      path.dirname(this.config.tempDir),
      this.storageRealPath,
      this.tempRealPath,
      path.dirname(this.storageRealPath),
      path.dirname(this.tempRealPath)
    ]);

    return [...reservedRoots].some((reservedRoot) =>
      isPathInsideRoot(reservedRoot, resolvedTarget)
    );
  }

  toRelativeScope(targetPath: string): string {
    const relative = path.relative(this.config.shelbyWorkdir, targetPath).replace(/\\/g, "/");
    return relative === "" ? "." : relative;
  }

  private async resolveWithinScope(
    inputPath: string,
    options: ResolveSandboxPathOptions
  ): Promise<string> {
    const resolvedPath = path.isAbsolute(inputPath)
      ? path.resolve(inputPath)
      : path.resolve(this.activeScopePath, inputPath);

    if (!isPathInsideRoot(this.config.shelbyWorkdir, resolvedPath)) {
      this.logger.warn({ inputPath, resolvedPath }, "Sandbox rejected path outside root.", {
        notifyClient: true
      });
      throw new AppError(
        "SANDBOX_VIOLATION",
        "Path must stay within the configured Shelby workdir.",
        {
          inputPath,
          rootPath: this.config.shelbyWorkdir
        }
      );
    }

    if (!isPathInsideRoot(this.activeScopePath, resolvedPath)) {
      this.logger.warn(
        { inputPath, resolvedPath, activeScopePath: this.activeScopePath },
        "Sandbox rejected path outside active safe scope.",
        { notifyClient: true }
      );
      throw new AppError("SAFE_SCOPE_VIOLATION", "Path must stay within the active safe scope.", {
        inputPath,
        activeScopePath: this.activeScopePath
      });
    }

    const checkedPath = await this.validateRealPath(resolvedPath, options.mustExist);
    if (this.isReservedPath(checkedPath)) {
      this.logger.warn({ inputPath, resolvedPath }, "Sandbox rejected reserved internal path.", {
        notifyClient: true
      });
      throw new AppError(
        "SANDBOX_RESERVED_PATH",
        "Path points to an internal Shelby directory that agents cannot access.",
        {
          inputPath
        }
      );
    }

    if (options.mustExist) {
      const stats = await fs.stat(resolvedPath).catch(() => null);
      if (!stats) {
        throw new AppError("FILE_NOT_FOUND", `Path does not exist: ${resolvedPath}`);
      }

      if (options.expectedType === "file" && !stats.isFile()) {
        throw new AppError("INVALID_PATH_TYPE", `Expected a file path: ${resolvedPath}`);
      }
      if (options.expectedType === "directory" && !stats.isDirectory()) {
        throw new AppError("INVALID_PATH_TYPE", `Expected a directory path: ${resolvedPath}`);
      }
    } else if (options.writeIntent) {
      await ensureDir(path.dirname(resolvedPath));
    }

    return assertPathInsideRoot(this.activeScopePath, resolvedPath, "path");
  }

  private async validateRealPath(targetPath: string, mustExist: boolean): Promise<string> {
    const rootRealPath = this.rootRealPath || (await fs.realpath(this.config.shelbyWorkdir));
    const scopeRealPath = (await realpathOrNull(this.activeScopePath)) ?? this.activeScopePath;

    const existingRealPath = mustExist
      ? await fs.realpath(targetPath).catch(() => null)
      : await realpathOrNull(targetPath);

    const checkPath = existingRealPath ?? (await findNearestExistingAncestor(targetPath));

    if (!isPathInsideRoot(rootRealPath, checkPath)) {
      throw new AppError(
        "SANDBOX_SYMLINK_ESCAPE",
        "Resolved path escapes the Shelby workdir via a symlink or mount.",
        {
          targetPath
        }
      );
    }

    if (!isPathInsideRoot(scopeRealPath, checkPath)) {
      throw new AppError("SAFE_SCOPE_VIOLATION", "Resolved path escapes the active safe scope.", {
        targetPath,
        activeScopePath: this.activeScopePath
      });
    }

    return existingRealPath ?? targetPath;
  }
}
