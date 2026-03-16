import crypto from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { Dirent } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { lookup as lookupMimeType } from "mime-types";

export async function ensureDir(directoryPath: string): Promise<void> {
  await fs.mkdir(directoryPath, { recursive: true });
}

export function resolveUserPath(inputPath: string, cwd = process.cwd()): string {
  return path.resolve(cwd, inputPath);
}

export function isPathInsideRoot(rootDir: string, targetPath: string): boolean {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function assertPathInsideRoot(rootDir: string, targetPath: string, label = "path"): string {
  const resolvedTarget = path.resolve(targetPath);
  if (isPathInsideRoot(rootDir, resolvedTarget)) {
    return resolvedTarget;
  }
  throw new Error(`${label} must stay within ${path.resolve(rootDir)}`);
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

export async function writeJsonFileAtomic(filePath: string, value: unknown): Promise<void> {
  const directory = path.dirname(filePath);
  await ensureDir(directory);
  const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

export function sha256Buffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");

  await pipeline(
    createReadStream(filePath),
    new Transform({
      transform(chunk, _encoding, callback) {
        hash.update(chunk as Buffer);
        callback(null, chunk);
      }
    }),
    new Transform({
      transform(_chunk, _encoding, callback) {
        callback();
      }
    })
  );

  return hash.digest("hex");
}

export async function readFileStreamToBuffer(options: {
  filePath: string;
  chunkSizeBytes: number;
}): Promise<{ buffer: Buffer; size: number; checksum: string }> {
  const hash = crypto.createHash("sha256");
  const chunks: Buffer[] = [];
  let size = 0;

  await pipeline(
    createReadStream(options.filePath, {
      highWaterMark: options.chunkSizeBytes
    }),
    new Transform({
      transform(chunk, _encoding, callback) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        hash.update(buffer);
        size += buffer.length;
        chunks.push(buffer);
        callback(null, chunk);
      }
    }),
    new Transform({
      transform(_chunk, _encoding, callback) {
        callback();
      }
    })
  );

  return {
    buffer: Buffer.concat(chunks),
    size,
    checksum: hash.digest("hex")
  };
}

export async function streamFileToDestination(options: {
  sourcePath: string;
  destinationPath: string;
  chunkSizeBytes: number;
  cleanupOnError?: boolean;
  onChunk?: (chunkSize: number, totalBytes: number) => void;
}): Promise<{ bytesWritten: number; checksum: string }> {
  const hash = crypto.createHash("sha256");
  let bytesWritten = 0;

  await ensureDir(path.dirname(options.destinationPath));

  try {
    await pipeline(
      createReadStream(options.sourcePath, {
        highWaterMark: options.chunkSizeBytes
      }),
      new Transform({
        transform(chunk, _encoding, callback) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          hash.update(buffer);
          bytesWritten += buffer.length;

          try {
            options.onChunk?.(buffer.length, bytesWritten);
          } catch (error) {
            callback(error as Error);
            return;
          }

          callback(null, buffer);
        }
      }),
      createWriteStream(options.destinationPath, {
        flags: "wx"
      })
    );
  } catch (error) {
    if (options.cleanupOnError ?? true) {
      await fs.rm(options.destinationPath, { force: true }).catch(() => undefined);
    }
    throw error;
  }

  return {
    bytesWritten,
    checksum: hash.digest("hex")
  };
}

export function inferContentType(fileName: string, fallback = "application/octet-stream"): string {
  return lookupMimeType(fileName) || fallback;
}

export function joinSafeFilePath(basePath: string, name: string): string {
  return path.join(basePath, name);
}

export async function statOrNull(targetPath: string) {
  try {
    return await fs.stat(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function realpathOrNull(targetPath: string): Promise<string | null> {
  try {
    return await fs.realpath(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function findNearestExistingAncestor(targetPath: string): Promise<string> {
  let current = path.resolve(targetPath);

  while (true) {
    const real = await realpathOrNull(current);
    if (real) {
      return real;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`No existing ancestor found for path: ${targetPath}`);
    }
    current = parent;
  }
}

export async function listFilesInDirectory(
  directory: string,
  options: {
    recursive: boolean;
    maxEntries: number;
    exclude?: (fullPath: string, entry: Dirent) => boolean;
  }
): Promise<{ files: string[]; truncated: boolean; totalDiscovered: number }> {
  const files: string[] = [];
  let truncated = false;
  let totalDiscovered = 0;

  async function walk(currentDirectory: string): Promise<void> {
    const entries = await fs.readdir(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDirectory, entry.name);

      if (options.exclude?.(fullPath, entry)) {
        continue;
      }

      if (entry.isDirectory()) {
        if (options.recursive) {
          await walk(fullPath);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      totalDiscovered += 1;
      if (files.length < options.maxEntries) {
        files.push(fullPath);
      } else {
        truncated = true;
      }
    }
  }

  await walk(directory);

  files.sort((left, right) => left.localeCompare(right));
  return { files, truncated, totalDiscovered };
}
