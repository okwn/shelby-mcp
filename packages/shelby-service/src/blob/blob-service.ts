import fs from "node:fs/promises";
import path from "node:path";
import { inferContentType, listFilesInDirectory } from "../../../shared/src/index.js";
import type { AppConfig, AppLogger } from "../../../shared/src/index.js";
import { AppError } from "../errors/index.js";
import type { SandboxService } from "../sandbox/index.js";
import type {
  BatchUploadInput,
  BlobIdentifierInput,
  DownloadBlobInput,
  ListBlobsInput,
  ListLocalUploadCandidatesInput,
  ListLocalUploadCandidatesResult,
  ShelbyProvider,
  UploadFileInput,
  UploadTextInput,
  VerifyBlobInput,
  WriteJsonInput
} from "../types/index.js";
import type { UploadPolicyService } from "./upload-policy.js";

export class BlobService {
  constructor(
    private readonly provider: ShelbyProvider,
    private readonly config: AppConfig,
    private readonly sandbox: SandboxService,
    private readonly logger: AppLogger,
    private readonly uploadPolicy: UploadPolicyService
  ) {}

  async list(input: ListBlobsInput) {
    return this.provider.listBlobs(input);
  }

  async getMetadata(input: BlobIdentifierInput) {
    return this.provider.getBlobMetadata(input);
  }

  async uploadFile(input: UploadFileInput) {
    const resolvedPath = await this.sandbox.resolveInputFile(input.path);
    const stats = await fs.stat(resolvedPath).catch(() => null);
    if (!stats?.isFile()) {
      throw new AppError("FILE_NOT_FOUND", `Upload source file does not exist: ${resolvedPath}`);
    }

    if (stats.size > this.config.maxUploadSizeBytes) {
      throw new AppError("UPLOAD_TOO_LARGE", "The file exceeds the configured upload limit.", {
        path: resolvedPath,
        size: stats.size,
        maxUploadSizeBytes: this.config.maxUploadSizeBytes
      });
    }

    const metadata = this.uploadPolicy.resolveMetadata(input.metadata, {
      operation: "shelby_upload_file"
    });
    const streamInput = {
      ...input,
      path: resolvedPath,
      metadata,
      contentType: input.contentType ?? inferContentType(input.targetName ?? resolvedPath)
    };

    if (this.provider.uploadFileStream) {
      return this.provider.uploadFileStream({
        ...streamInput,
        chunkSizeBytes: this.config.streamUploadChunkSizeBytes,
        sizeBytes: stats.size
      });
    }

    return this.provider.uploadFile(streamInput);
  }

  async uploadText(input: UploadTextInput) {
    const size = Buffer.byteLength(input.text, "utf8");
    if (size > this.config.maxUploadSizeBytes) {
      throw new AppError(
        "UPLOAD_TOO_LARGE",
        "The text payload exceeds the configured upload limit.",
        {
          size,
          maxUploadSizeBytes: this.config.maxUploadSizeBytes
        }
      );
    }

    return this.provider.uploadText({
      ...input,
      metadata: this.uploadPolicy.resolveMetadata(input.metadata, {
        operation: "shelby_upload_text"
      })
    });
  }

  async downloadBlob(input: DownloadBlobInput) {
    const metadata = await this.provider.getBlobMetadata(input);
    const outputPath = input.outputPath
      ? await this.sandbox.resolveOutputFile(input.outputPath)
      : await this.sandbox.getDefaultDownloadPath(metadata.name);
    return this.provider.downloadBlob({
      ...input,
      outputPath
    });
  }

  async readBlobText(input: { blobId?: string; blobKey?: string; maxBytes?: number }) {
    const maxBytes = Math.min(
      input.maxBytes ?? this.config.maxReadTextBytes,
      this.config.maxReadTextBytes
    );
    return this.provider.readBlobText({
      ...input,
      maxBytes
    });
  }

  async getBlobUrl(input: BlobIdentifierInput) {
    return this.provider.getBlobUrl(input);
  }

  async deleteBlob(input: BlobIdentifierInput) {
    if (!this.config.allowDestructiveTools) {
      this.logger.warn({ input }, "Destructive Shelby tool denied by configuration.", {
        notifyClient: true
      });
      throw new AppError(
        "TOOL_DISABLED",
        "Destructive Shelby tools are disabled. Set ALLOW_DESTRUCTIVE_TOOLS=true to enable delete operations."
      );
    }

    return this.provider.deleteBlob(input);
  }

  async batchUpload(input: BatchUploadInput) {
    const resolvedPaths = await Promise.all(
      input.paths.map((currentPath) => this.sandbox.resolveInputFile(currentPath))
    );
    for (const resolvedPath of resolvedPaths) {
      const stats = await fs.stat(resolvedPath).catch(() => null);
      if (!stats?.isFile()) {
        if (!input.continueOnError) {
          throw new AppError(
            "FILE_NOT_FOUND",
            `Upload source file does not exist: ${resolvedPath}`
          );
        }
        continue;
      }

      if (stats.size > this.config.maxUploadSizeBytes && !input.continueOnError) {
        throw new AppError(
          "UPLOAD_TOO_LARGE",
          "One of the batch files exceeds the configured upload limit.",
          {
            path: resolvedPath,
            size: stats.size,
            maxUploadSizeBytes: this.config.maxUploadSizeBytes
          }
        );
      }
    }

    return this.provider.batchUpload({
      ...input,
      metadata: this.uploadPolicy.resolveMetadata(input.metadata, {
        operation: "shelby_batch_upload"
      }),
      paths: resolvedPaths
    });
  }

  async verifyBlob(input: VerifyBlobInput) {
    const localPath = input.localPath
      ? await this.sandbox.resolveInputFile(input.localPath)
      : undefined;
    return this.provider.verifyBlob({
      ...input,
      localPath
    });
  }

  async writeJson(input: WriteJsonInput) {
    let text: string;
    try {
      text = JSON.stringify(input.data, null, 2);
    } catch (error) {
      throw new AppError(
        "INVALID_JSON",
        `Unable to serialize JSON payload: ${(error as Error).message}`
      );
    }

    return this.provider.uploadText({
      text,
      targetName: input.targetName,
      contentType: "application/json",
      metadata: this.uploadPolicy.resolveMetadata(input.metadata, {
        operation: "shelby_write_json"
      })
    });
  }

  async listLocalUploadCandidates(
    input: ListLocalUploadCandidatesInput
  ): Promise<ListLocalUploadCandidatesResult> {
    const directory = await this.sandbox.resolveInputDirectory(input.directory);
    const stats = await fs.stat(directory).catch(() => null);
    if (!stats?.isDirectory()) {
      throw new AppError("DIRECTORY_NOT_FOUND", `Directory does not exist: ${directory}`);
    }

    const maxEntries = Math.max(1, Math.min(input.maxEntries ?? 200, 1000));
    const scanResult = await listFilesInDirectory(directory, {
      recursive: input.recursive ?? false,
      maxEntries,
      exclude: (fullPath, entry) => entry.isDirectory() && this.sandbox.isReservedPath(fullPath)
    });

    const files = await Promise.all(
      scanResult.files.map(async (filePath) => {
        const fileStats = await fs.stat(filePath);
        return {
          path: filePath,
          relativePath: path.relative(directory, filePath).replace(/\\/g, "/"),
          size: fileStats.size,
          contentType: inferContentType(filePath),
          modifiedAt: fileStats.mtime.toISOString()
        };
      })
    );

    return {
      files,
      totalDiscovered: scanResult.totalDiscovered,
      truncated: scanResult.truncated
    };
  }
}
