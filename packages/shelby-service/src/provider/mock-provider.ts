import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  type AppConfig,
  type AppLogger,
  decodeCursor,
  encodeCursor,
  ensureDir,
  getSafeConfigSummary,
  inferContentType,
  isTextLikeContentType,
  readJsonFile,
  sha256Buffer,
  sha256File,
  statOrNull,
  streamFileToDestination,
  stripUndefined,
  toIsoDate,
  writeJsonFileAtomic
} from "../../../shared/src/index.js";
import { AppError, toSerializableError } from "../errors/index.js";
import type {
  AccountInfo,
  BatchUploadInput,
  BatchUploadResult,
  BlobIdentifierInput,
  BlobMetadata,
  BlobSummary,
  BlobUrlResult,
  DeleteBlobResult,
  DownloadBlobInput,
  DownloadResult,
  HealthcheckResult,
  ListBlobsInput,
  ListBlobsResult,
  ProviderCapabilities,
  ReadBlobTextInput,
  ReadBlobTextResult,
  ShelbyProvider,
  UploadFileInput,
  UploadFileStreamInput,
  UploadResult,
  UploadTextInput,
  VerificationResult,
  VerifyBlobInput
} from "../types/index.js";

type MockBlobRecord = BlobMetadata & {
  storagePath: string;
};

type MockIndex = {
  blobs: MockBlobRecord[];
};

export class MockShelbyProvider implements ShelbyProvider {
  private readonly rootDir: string;
  private readonly blobDir: string;
  private readonly indexPath: string;
  private readonly capabilitiesValue: ProviderCapabilities;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: AppLogger
  ) {
    this.rootDir = path.join(config.shelbyStorageDir, "mock-provider");
    this.blobDir = path.join(this.rootDir, "blobs");
    this.indexPath = path.join(this.rootDir, "index.json");
    this.capabilitiesValue = {
      supportsDelete: true,
      supportsSignedUrls: false,
      supportsMetadata: true,
      supportsBatch: true,
      supportsVerification: true,
      supportsMedia: false,
      supportsPagination: true,
      supportsStreamingUpload: true,
      supportsStrictMetadataValidation: true,
      mode: "mock",
      notes: [
        "Mock provider stores blobs on the local filesystem inside SHELBY_STORAGE_DIR.",
        "File uploads are streamed to local storage with checksum calculation."
      ]
    };
  }

  capabilities(): ProviderCapabilities {
    return this.capabilitiesValue;
  }

  async getAccountInfo(): Promise<AccountInfo> {
    await this.ensureReady();
    return {
      provider: "mock-shelby",
      mode: "mock",
      accountId: this.config.shelbyAccountId ?? "mock-account",
      network: {
        name: this.config.shelbyNetwork ?? "local"
      },
      status: "ready",
      capabilities: this.capabilities(),
      notes: ["Local mock provider for development and CI."]
    };
  }

  async listBlobs(input: ListBlobsInput): Promise<ListBlobsResult> {
    const index = await this.readIndex();
    const limit = Math.max(1, Math.min(input.limit ?? 25, 100));
    const offset = decodeCursor(input.cursor);
    const filtered = input.prefix
      ? index.blobs.filter((blob) => blob.key.startsWith(input.prefix ?? ""))
      : index.blobs;
    const items = filtered
      .slice(offset, offset + limit)
      .map((record) => this.toBlobSummary(record));
    const nextOffset = offset + items.length;

    return stripUndefined({
      items,
      nextCursor: nextOffset < filtered.length ? encodeCursor(nextOffset) : undefined,
      totalKnown: filtered.length
    });
  }

  async getBlobMetadata(input: BlobIdentifierInput): Promise<BlobMetadata> {
    const record = await this.getRecord(input);
    return this.toBlobMetadata(record);
  }

  async uploadFile(input: UploadFileInput): Promise<UploadResult> {
    await this.ensureReady();
    const sourceStats = await statOrNull(input.path);
    if (!sourceStats?.isFile()) {
      throw new AppError("FILE_NOT_FOUND", `Upload source file does not exist: ${input.path}`);
    }

    return this.uploadFileStream({
      ...input,
      chunkSizeBytes: this.config.streamUploadChunkSizeBytes,
      sizeBytes: sourceStats.size
    });
  }

  async uploadFileStream(input: UploadFileStreamInput): Promise<UploadResult> {
    await this.ensureReady();
    const sourceStats = await statOrNull(input.path);
    if (!sourceStats?.isFile()) {
      throw new AppError("FILE_NOT_FOUND", `Upload source file does not exist: ${input.path}`);
    }

    const storedName = input.targetName
      ? this.normalizeBlobKey(input.targetName)
      : path.basename(input.path);

    this.logger.info(
      {
        path: input.path,
        targetName: storedName,
        sizeBytes: input.sizeBytes
      },
      "Mock provider uploading file via stream."
    );

    return this.persistBlobFromFile({
      sourcePath: input.path,
      targetName: storedName,
      contentType: input.contentType ?? inferContentType(storedName),
      metadata: input.metadata,
      sourceLabel: input.path,
      chunkSizeBytes: input.chunkSizeBytes,
      sizeBytes: input.sizeBytes
    });
  }

  async uploadText(input: UploadTextInput): Promise<UploadResult> {
    await this.ensureReady();
    const buffer = Buffer.from(input.text, "utf8");
    const checksum = sha256Buffer(buffer);

    return this.persistBlob({
      buffer,
      targetName: this.normalizeBlobKey(input.targetName),
      contentType: input.contentType ?? "text/plain",
      metadata: input.metadata,
      sourceLabel: "inline-text",
      checksum
    });
  }

  async downloadBlob(input: DownloadBlobInput): Promise<DownloadResult> {
    const record = await this.getRecord(input);
    const sourcePath = this.resolveStoragePath(record.storagePath);
    const targetPath = input.outputPath ?? path.join(this.config.tempDir, record.name);
    await ensureDir(path.dirname(targetPath));
    await fs.copyFile(sourcePath, targetPath);
    const stats = await fs.stat(targetPath);

    return {
      savedPath: targetPath,
      bytesWritten: stats.size,
      metadata: this.toBlobMetadata(record)
    };
  }

  async readBlobText(input: ReadBlobTextInput): Promise<ReadBlobTextResult> {
    const record = await this.getRecord(input);
    const buffer = await fs.readFile(this.resolveStoragePath(record.storagePath));

    if (!isTextLikeContentType(record.contentType)) {
      throw new AppError("BLOB_NOT_TEXT", "The blob content type does not look text-safe.", {
        contentType: record.contentType ?? null
      });
    }

    const maxBytes = Math.max(1, input.maxBytes ?? this.config.maxReadTextBytes);
    const slice = buffer.subarray(0, maxBytes);

    return {
      text: slice.toString("utf8"),
      truncated: buffer.length > maxBytes,
      bytesRead: slice.length,
      metadata: this.toBlobMetadata(record)
    };
  }

  async getBlobUrl(input: BlobIdentifierInput): Promise<BlobUrlResult> {
    const record = await this.getRecord(input);
    return {
      url: pathToFileURL(this.resolveStoragePath(record.storagePath)).toString(),
      note: "Local mock-provider file URL."
    };
  }

  async deleteBlob(input: BlobIdentifierInput): Promise<DeleteBlobResult> {
    const index = await this.readIndex();
    const record = this.findRecord(index, input);
    if (!record) {
      throw new AppError("BLOB_NOT_FOUND", "Blob not found.", input);
    }

    await fs.rm(this.resolveStoragePath(record.storagePath), { force: true });
    index.blobs = index.blobs.filter((blob) => blob.id !== record.id);
    await this.writeIndex(index);

    return {
      success: true,
      deletedId: record.id
    };
  }

  async batchUpload(input: BatchUploadInput): Promise<BatchUploadResult> {
    const successes: UploadResult[] = [];
    const failures: BatchUploadResult["failures"] = [];

    for (const currentPath of input.paths) {
      const targetName = input.prefix
        ? path.posix.join(input.prefix, path.basename(currentPath).replace(/\\/g, "/"))
        : path.basename(currentPath);

      try {
        const stats = await fs.stat(currentPath);
        const result = await this.uploadFileStream({
          path: currentPath,
          targetName,
          metadata: input.metadata,
          chunkSizeBytes: this.config.streamUploadChunkSizeBytes,
          sizeBytes: stats.size
        });
        successes.push(result);
      } catch (error) {
        failures.push({
          path: currentPath,
          error: toSerializableError(error)
        });
        if (!input.continueOnError) {
          break;
        }
      }
    }

    return {
      successes,
      failures
    };
  }

  async verifyBlob(input: VerifyBlobInput): Promise<VerificationResult> {
    const record = await this.getRecord(input);
    const remoteChecksum = record.checksum?.value;

    if (!remoteChecksum) {
      return {
        verified: false,
        note: "Remote checksum is unavailable.",
        metadata: this.toBlobMetadata(record)
      };
    }

    if (!input.localPath) {
      return {
        verified: true,
        checksumRemote: remoteChecksum,
        note: "Remote checksum is available; no local comparison was requested.",
        metadata: this.toBlobMetadata(record)
      };
    }

    const checksumLocal = await sha256File(input.localPath);
    return {
      verified: checksumLocal === remoteChecksum,
      checksumLocal,
      checksumRemote: remoteChecksum,
      note:
        checksumLocal === remoteChecksum
          ? "Local and remote checksums match."
          : "Checksum mismatch detected.",
      metadata: this.toBlobMetadata(record)
    };
  }

  async healthcheck(): Promise<HealthcheckResult> {
    await this.ensureReady();
    const index = await this.readIndex();

    return {
      ok: true,
      provider: "mock-shelby",
      mode: "mock",
      config: {
        ...getSafeConfigSummary(this.config),
        mockStorageDir: this.rootDir,
        blobCount: index.blobs.length
      },
      warnings: []
    };
  }

  private async ensureReady(): Promise<void> {
    await ensureDir(this.blobDir);
    if (!(await statOrNull(this.indexPath))) {
      await this.writeIndex({ blobs: [] });
    }
  }

  private async readIndex(): Promise<MockIndex> {
    await this.ensureReady();
    const index = await readJsonFile<MockIndex>(this.indexPath, { blobs: [] });
    index.blobs.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return index;
  }

  private async writeIndex(index: MockIndex): Promise<void> {
    await writeJsonFileAtomic(this.indexPath, index);
  }

  private normalizeBlobKey(value: string): string {
    return value.replace(/\\/g, "/").replace(/^\/+/, "").trim() || "blob";
  }

  private createUniqueKey(existingKeys: Set<string>, requestedKey: string): string {
    const normalized = this.normalizeBlobKey(requestedKey);
    if (!existingKeys.has(normalized)) {
      return normalized;
    }

    const parsed = path.posix.parse(normalized);
    let counter = 2;
    while (true) {
      const candidate = path.posix.join(parsed.dir, `${parsed.name}-${counter}${parsed.ext}`);
      if (!existingKeys.has(candidate)) {
        return candidate;
      }
      counter += 1;
    }
  }

  private async persistBlob(options: {
    buffer: Buffer;
    targetName: string;
    contentType: string;
    metadata?: Record<string, string>;
    sourceLabel: string;
    checksum: string;
  }): Promise<UploadResult> {
    const index = await this.readIndex();
    const id = crypto.randomUUID();
    const key = this.createUniqueKey(
      new Set(index.blobs.map((blob) => blob.key)),
      options.targetName
    );
    const storageName = `${id}-${path.basename(key)}`;
    const relativeStoragePath = path.join("blobs", storageName);
    const absoluteStoragePath = this.resolveStoragePath(relativeStoragePath);
    await ensureDir(path.dirname(absoluteStoragePath));
    await fs.writeFile(absoluteStoragePath, options.buffer);

    const record: MockBlobRecord = {
      id,
      key,
      name: path.posix.basename(key),
      size: options.buffer.length,
      contentType: options.contentType,
      createdAt: toIsoDate(),
      checksum: {
        algorithm: "sha256",
        value: options.checksum
      },
      providerMetadata: {
        source: options.sourceLabel,
        storagePath: relativeStoragePath,
        mock: true
      },
      metadata: options.metadata,
      storagePath: relativeStoragePath
    };

    index.blobs.unshift(record);
    await this.writeIndex(index);

    return {
      ...this.toBlobMetadata(record),
      retrieval: {
        url: pathToFileURL(absoluteStoragePath).toString(),
        note: "Local mock-provider file URL."
      }
    };
  }

  private async persistBlobFromFile(options: {
    sourcePath: string;
    targetName: string;
    contentType: string;
    metadata?: Record<string, string>;
    sourceLabel: string;
    chunkSizeBytes: number;
    sizeBytes: number;
  }): Promise<UploadResult> {
    const index = await this.readIndex();
    const id = crypto.randomUUID();
    const key = this.createUniqueKey(
      new Set(index.blobs.map((blob) => blob.key)),
      options.targetName
    );
    const storageName = `${id}-${path.basename(key)}`;
    const relativeStoragePath = path.join("blobs", storageName);
    const absoluteStoragePath = this.resolveStoragePath(relativeStoragePath);
    const tempStoragePath = `${absoluteStoragePath}.${crypto.randomUUID()}.tmp`;
    let promoted = false;

    try {
      const streamResult = await streamFileToDestination({
        sourcePath: options.sourcePath,
        destinationPath: tempStoragePath,
        chunkSizeBytes: options.chunkSizeBytes
      });

      await fs.rename(tempStoragePath, absoluteStoragePath);
      promoted = true;

      const record: MockBlobRecord = {
        id,
        key,
        name: path.posix.basename(key),
        size: options.sizeBytes,
        contentType: options.contentType,
        createdAt: toIsoDate(),
        checksum: {
          algorithm: "sha256",
          value: streamResult.checksum
        },
        providerMetadata: {
          source: options.sourceLabel,
          storagePath: relativeStoragePath,
          mock: true
        },
        metadata: options.metadata,
        storagePath: relativeStoragePath
      };

      index.blobs.unshift(record);
      await this.writeIndex(index);

      return {
        ...this.toBlobMetadata(record),
        retrieval: {
          url: pathToFileURL(absoluteStoragePath).toString(),
          note: "Local mock-provider file URL."
        }
      };
    } catch (error) {
      await fs.rm(tempStoragePath, { force: true }).catch(() => undefined);
      if (promoted) {
        await fs.rm(absoluteStoragePath, { force: true }).catch(() => undefined);
      }
      throw error;
    }
  }

  private resolveStoragePath(relativeStoragePath: string): string {
    return path.join(this.rootDir, relativeStoragePath);
  }

  private findRecord(index: MockIndex, input: BlobIdentifierInput): MockBlobRecord | undefined {
    return index.blobs.find((blob) => {
      if (input.blobId) {
        return blob.id === input.blobId;
      }
      if (input.blobKey) {
        return blob.key === input.blobKey;
      }
      return false;
    });
  }

  private async getRecord(input: BlobIdentifierInput): Promise<MockBlobRecord> {
    if (!input.blobId && !input.blobKey) {
      throw new AppError("VALIDATION_ERROR", "Either blobId or blobKey is required.");
    }

    const index = await this.readIndex();
    const record = this.findRecord(index, input);
    if (!record) {
      throw new AppError("BLOB_NOT_FOUND", "Blob not found.", input);
    }
    return record;
  }

  private toBlobSummary(record: MockBlobRecord): BlobSummary {
    return {
      id: record.id,
      key: record.key,
      name: record.name,
      size: record.size,
      contentType: record.contentType,
      createdAt: record.createdAt
    };
  }

  private toBlobMetadata(record: MockBlobRecord): BlobMetadata {
    return {
      ...this.toBlobSummary(record),
      expiresAt: record.expiresAt,
      checksum: record.checksum,
      metadata: record.metadata,
      providerMetadata: {
        ...record.providerMetadata,
        storagePath: record.storagePath
      }
    };
  }
}
