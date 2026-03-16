import fs from "node:fs/promises";
import path from "node:path";
import { Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";
import {
  buildRequestUrl,
  createBlobKey,
  getShelbyAccountBlobsExplorerUrl,
  getShelbyBlobExplorerUrl,
  isBlobNotFoundError,
  isShelbyNetwork,
  type ShelbyNetwork,
  ShelbyNodeClient,
  type BlobMetadata as ShelbySdkBlobMetadata
} from "@shelby-protocol/sdk/node";
import {
  type AppConfig,
  type AppLogger,
  getSafeConfigSummary,
  inferContentType,
  readFileStreamToBuffer,
  sha256Buffer,
  stripUndefined
} from "../../../shared/src/index.js";
import { AppError } from "../errors/index.js";
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

function encodeBlobNameForUrl(blobName: string): string {
  return encodeURIComponent(blobName).replace(/%2F/g, "/");
}

async function readWebStreamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      chunks.push(value);
    }
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

type ResolvedBlobTarget = {
  accountId: string;
  blobName: string;
  blobKey: string;
};

export class RealShelbyProvider implements ShelbyProvider {
  private client?: ShelbyNodeClient;
  private signer?: Account;
  private hasLoggedStreamingFallback = false;
  private hasLoggedBatchBufferingWarning = false;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: AppLogger
  ) {}

  capabilities(): ProviderCapabilities {
    const hasNetwork = this.getShelbyNetwork() !== undefined;
    const hasAccount = Boolean(this.config.shelbyAccountId);
    const hasSigner = this.hasSigner();

    return {
      supportsDelete: hasSigner,
      supportsSignedUrls: false,
      supportsMetadata: hasNetwork && hasAccount,
      supportsBatch: hasSigner,
      supportsVerification: hasNetwork && hasAccount,
      supportsMedia: false,
      supportsPagination: hasNetwork && hasAccount,
      supportsStreamingUpload: false,
      supportsStrictMetadataValidation: true,
      mode: "real",
      notes: [
        "Uses the official @shelby-protocol/sdk for real Shelby operations.",
        "File upload entrypoints accept stream-based inputs, but the current Shelby SDK adapter still buffers uploads before submission.",
        hasSigner
          ? "Upload, batch upload, and delete are enabled because a signer is configured."
          : "Write operations require SHELBY_PRIVATE_KEY and a matching SHELBY_ACCOUNT_ID."
      ]
    };
  }

  async getAccountInfo(): Promise<AccountInfo> {
    const warnings: string[] = [];

    if (!this.getShelbyNetwork()) {
      warnings.push("SHELBY_NETWORK must be one of: local, testnet, shelbynet.");
    }
    if (!this.config.shelbyAccountId) {
      warnings.push("SHELBY_ACCOUNT_ID is required for real-provider blob operations.");
    }

    return {
      provider: "real-shelby",
      mode: "real",
      accountId: this.config.shelbyAccountId,
      network: stripUndefined({
        name: this.config.shelbyNetwork,
        apiUrl: this.config.shelbyApiUrl,
        rpcUrl: this.config.shelbyApiUrl,
        explorerUrl:
          this.config.shelbyNetwork && this.config.shelbyAccountId
            ? getShelbyAccountBlobsExplorerUrl(
                this.config.shelbyNetwork,
                this.config.shelbyAccountId
              )
            : undefined
      }),
      status: warnings.length > 0 ? "degraded" : "ready",
      capabilities: this.capabilities(),
      notes: warnings
    };
  }

  async listBlobs(input: ListBlobsInput): Promise<ListBlobsResult> {
    const client = this.getClient();
    const accountId = this.requireAccountId();
    const offset = this.decodeOffset(input.cursor);
    const limit = Math.max(1, Math.min(input.limit ?? 25, 100));
    const where = input.prefix
      ? ({ blob_name: { _like: `${input.prefix}%` } } as const)
      : undefined;

    const [items, totalKnown] = await Promise.all([
      client.coordination.getAccountBlobs({
        account: accountId,
        pagination: { limit, offset },
        where
      }),
      client.coordination
        .getBlobsCount({
          where: stripUndefined({
            owner: { _eq: accountId },
            blob_name: input.prefix ? { _like: `${input.prefix}%` } : undefined
          })
        })
        .catch(() => undefined)
    ]);

    const summaries = items.map((item) => this.mapBlobSummary(item));
    const nextCursor =
      totalKnown !== undefined && offset + summaries.length < totalKnown
        ? this.encodeOffset(offset + summaries.length)
        : undefined;

    return stripUndefined({
      items: summaries,
      nextCursor,
      totalKnown
    });
  }

  async getBlobMetadata(input: BlobIdentifierInput): Promise<BlobMetadata> {
    const client = this.getClient();
    const target = this.resolveBlobTarget(input);

    try {
      const metadata = await client.coordination.getBlobMetadata({
        account: target.accountId,
        name: target.blobName
      });

      if (!metadata) {
        throw new AppError("BLOB_NOT_FOUND", "Blob not found.", input);
      }

      return this.mapBlobMetadata(metadata);
    } catch (error) {
      throw this.wrapShelbyError(error, "getBlobMetadata", input);
    }
  }

  async uploadFile(input: UploadFileInput): Promise<UploadResult> {
    const stats = await fs.stat(input.path);
    return this.uploadFileStream({
      ...input,
      chunkSizeBytes: this.config.streamUploadChunkSizeBytes,
      sizeBytes: stats.size
    });
  }

  async uploadFileStream(input: UploadFileStreamInput): Promise<UploadResult> {
    this.logStreamingFallback();

    const streamed = await readFileStreamToBuffer({
      filePath: input.path,
      chunkSizeBytes: input.chunkSizeBytes
    });

    return this.uploadBuffer(
      streamed.buffer,
      input.targetName ?? path.basename(input.path),
      input.contentType ?? inferContentType(input.path),
      input.metadata,
      streamed.checksum
    );
  }

  async uploadText(input: UploadTextInput): Promise<UploadResult> {
    const buffer = Buffer.from(input.text, "utf8");
    return this.uploadBuffer(
      buffer,
      input.targetName,
      input.contentType ?? "text/plain",
      input.metadata,
      sha256Buffer(buffer)
    );
  }

  async downloadBlob(input: DownloadBlobInput): Promise<DownloadResult> {
    const client = this.getClient();
    const target = this.resolveBlobTarget(input);
    const metadata = await this.getBlobMetadata(input);
    const destination = input.outputPath ?? path.join(this.config.tempDir, metadata.name);

    try {
      const blob = await client.download({
        account: target.accountId,
        blobName: target.blobName
      });
      const buffer = await readWebStreamToBuffer(blob.readable as ReadableStream<Uint8Array>);
      await fs.writeFile(destination, buffer);

      return {
        savedPath: destination,
        bytesWritten: buffer.length,
        metadata
      };
    } catch (error) {
      throw this.wrapShelbyError(error, "downloadBlob", input);
    }
  }

  async readBlobText(input: ReadBlobTextInput): Promise<ReadBlobTextResult> {
    const client = this.getClient();
    const target = this.resolveBlobTarget(input);
    const metadata = await this.getBlobMetadata(input);
    const maxBytes = Math.max(1, input.maxBytes ?? this.config.maxReadTextBytes);

    if (
      metadata.contentType &&
      !metadata.contentType.startsWith("text/") &&
      metadata.contentType !== "application/json"
    ) {
      throw new AppError("BLOB_NOT_TEXT", "The blob content type does not look text-safe.", {
        contentType: metadata.contentType
      });
    }

    try {
      const blob = await client.download({
        account: target.accountId,
        blobName: target.blobName,
        range: {
          start: 0,
          end: maxBytes - 1
        }
      });
      const buffer = await readWebStreamToBuffer(blob.readable as ReadableStream<Uint8Array>);

      return {
        text: buffer.toString("utf8"),
        truncated: metadata.size > buffer.length,
        bytesRead: buffer.length,
        metadata
      };
    } catch (error) {
      throw this.wrapShelbyError(error, "readBlobText", input);
    }
  }

  async getBlobUrl(input: BlobIdentifierInput): Promise<BlobUrlResult> {
    const client = this.getClient();
    const target = this.resolveBlobTarget(input);
    const url = buildRequestUrl(
      `/v1/blobs/${target.accountId}/${encodeBlobNameForUrl(target.blobName)}`,
      client.baseUrl
    );

    return {
      url: url.toString(),
      note: this.config.shelbyApiKey
        ? "Direct Shelby RPC URL; caller may need an Authorization header with SHELBY_API_KEY."
        : "Direct Shelby RPC URL."
    };
  }

  async deleteBlob(input: BlobIdentifierInput): Promise<DeleteBlobResult> {
    const client = this.getClient();
    const signer = this.requireSigner();
    const target = this.resolveBlobTarget(input);

    try {
      await client.coordination.deleteBlob({
        account: signer,
        blobName: target.blobName
      });

      return {
        success: true,
        deletedId: target.blobKey
      };
    } catch (error) {
      throw this.wrapShelbyError(error, "deleteBlob", input);
    }
  }

  async batchUpload(input: BatchUploadInput): Promise<BatchUploadResult> {
    const client = this.getClient();
    const signer = this.requireSigner();
    const accountId = this.requireAccountId();
    const failures: BatchUploadResult["failures"] = [];

    try {
      this.logBatchBufferingFallback();
      const blobs: Array<{
        blobData: Buffer;
        blobName: string;
        checksum: string;
      }> = [];

      for (const currentPath of input.paths) {
        const streamed = await readFileStreamToBuffer({
          filePath: currentPath,
          chunkSizeBytes: this.config.streamUploadChunkSizeBytes
        });
        blobs.push({
          blobData: streamed.buffer,
          blobName: input.prefix
            ? path.posix.join(input.prefix, path.basename(currentPath).replace(/\\/g, "/"))
            : path.basename(currentPath),
          checksum: streamed.checksum
        });
      }

      await client.batchUpload({
        blobs,
        signer,
        expirationMicros: this.getExpirationMicros()
      });

      const successes = blobs.map((blob) =>
        this.createFallbackUploadResult(
          accountId,
          blob.blobName,
          blob.blobData.length,
          inferContentType(blob.blobName),
          input.metadata,
          blob.checksum
        )
      );

      return {
        successes,
        failures
      };
    } catch (error) {
      const wrapped = this.wrapShelbyError(error, "batchUpload", input);
      if (!input.continueOnError) {
        throw wrapped;
      }
      failures.push({
        path: input.paths.join(","),
        error: {
          code: wrapped.code,
          message: wrapped.message,
          details: wrapped.details
        }
      });
      return { successes: [], failures };
    }
  }

  async verifyBlob(input: VerifyBlobInput): Promise<VerificationResult> {
    const client = this.getClient();
    const target = this.resolveBlobTarget(input);
    const metadata = await this.getBlobMetadata(input);

    try {
      const blob = await client.download({
        account: target.accountId,
        blobName: target.blobName
      });
      const remoteBuffer = await readWebStreamToBuffer(blob.readable as ReadableStream<Uint8Array>);
      const checksumRemote = sha256Buffer(remoteBuffer);

      if (!input.localPath) {
        return {
          verified: true,
          checksumRemote,
          note: "Remote checksum computed from a fresh download.",
          metadata
        };
      }

      const localBuffer = await fs.readFile(input.localPath);
      const checksumLocal = sha256Buffer(localBuffer);

      return {
        verified: checksumLocal === checksumRemote,
        checksumLocal,
        checksumRemote,
        note:
          checksumLocal === checksumRemote
            ? "Local and remote checksums match."
            : "Checksum mismatch detected.",
        metadata
      };
    } catch (error) {
      throw this.wrapShelbyError(error, "verifyBlob", input);
    }
  }

  async healthcheck(): Promise<HealthcheckResult> {
    const warnings: string[] = [];

    if (!this.getShelbyNetwork()) {
      warnings.push("SHELBY_NETWORK must be one of: local, testnet, shelbynet.");
    }
    if (!this.config.shelbyAccountId) {
      warnings.push("SHELBY_ACCOUNT_ID is missing; blob operations will be limited.");
    }

    try {
      if (this.getShelbyNetwork() && this.config.shelbyAccountId) {
        const client = this.getClient();
        await client.coordination.getAccountBlobs({
          account: this.config.shelbyAccountId,
          pagination: { limit: 1, offset: 0 }
        });
      }
    } catch (error) {
      warnings.push(this.wrapShelbyError(error, "healthcheck").message);
    }

    return {
      ok: warnings.length === 0,
      provider: "real-shelby",
      mode: "real",
      config: getSafeConfigSummary(this.config),
      warnings
    };
  }

  private async uploadBuffer(
    blobData: Buffer,
    blobName: string,
    contentType: string,
    metadata?: Record<string, string>,
    checksum?: string
  ): Promise<UploadResult> {
    const client = this.getClient();
    const signer = this.requireSigner();
    const accountId = this.requireAccountId();

    try {
      await client.upload({
        blobData,
        signer,
        blobName,
        expirationMicros: this.getExpirationMicros()
      });

      const onChainMetadata = await this.waitForMetadata(accountId, blobName);
      if (onChainMetadata) {
        const mappedMetadata = this.mapBlobMetadata(onChainMetadata);
        return {
          ...mappedMetadata,
          checksum: checksum
            ? {
                algorithm: "sha256",
                value: checksum
              }
            : undefined,
          metadata,
          providerMetadata: {
            ...mappedMetadata.providerMetadata,
            userMetadata: metadata
          }
        };
      }

      return this.createFallbackUploadResult(
        accountId,
        blobName,
        blobData.length,
        contentType,
        metadata,
        checksum
      );
    } catch (error) {
      throw this.wrapShelbyError(error, "uploadBuffer", { blobName });
    }
  }

  private createFallbackUploadResult(
    accountId: string,
    blobName: string,
    size: number,
    contentType: string,
    metadata?: Record<string, string>,
    checksum?: string
  ): UploadResult {
    const key = createBlobKey({
      account: accountId,
      blobName
    });

    return {
      id: key,
      key,
      name: path.posix.basename(blobName),
      size,
      contentType,
      createdAt: new Date().toISOString(),
      checksum: checksum
        ? {
            algorithm: "sha256",
            value: checksum
          }
        : undefined,
      metadata,
      providerMetadata: {
        owner: accountId,
        pendingIndexerSync: true
      },
      retrieval: {
        url: buildRequestUrl(
          `/v1/blobs/${accountId}/${encodeBlobNameForUrl(blobName)}`,
          this.getClient().baseUrl
        ).toString(),
        note: "Upload completed, but indexer metadata was not available before the timeout."
      }
    };
  }

  private async waitForMetadata(
    accountId: string,
    blobName: string
  ): Promise<ShelbySdkBlobMetadata | undefined> {
    const client = this.getClient();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const metadata = await client.coordination.getBlobMetadata({
        account: accountId,
        name: blobName
      });
      if (metadata) {
        return metadata;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return undefined;
  }

  private getClient(): ShelbyNodeClient {
    if (!this.client) {
      const network = this.getShelbyNetwork();
      if (!network) {
        throw new AppError(
          "REAL_PROVIDER_CONFIG_ERROR",
          "SHELBY_NETWORK must be one of: local, testnet, shelbynet."
        );
      }

      this.client = new ShelbyNodeClient({
        network,
        apiKey: this.config.shelbyApiKey,
        rpc: this.config.shelbyApiUrl
          ? {
              baseUrl: this.config.shelbyApiUrl,
              apiKey: this.config.shelbyApiKey
            }
          : undefined
      });
    }

    return this.client;
  }

  private getShelbyNetwork(): ShelbyNetwork | undefined {
    const normalized = this.config.shelbyNetwork?.toLowerCase();
    if (!normalized || !isShelbyNetwork(normalized)) {
      return undefined;
    }
    return normalized;
  }

  private requireAccountId(): string {
    if (!this.config.shelbyAccountId) {
      throw new AppError(
        "REAL_PROVIDER_CONFIG_ERROR",
        "SHELBY_ACCOUNT_ID is required for real-provider blob operations."
      );
    }
    return this.config.shelbyAccountId;
  }

  private hasSigner(): boolean {
    return Boolean(this.config.shelbyPrivateKey && this.config.shelbyAccountId);
  }

  private requireSigner(): Account {
    if (this.signer) {
      return this.signer;
    }

    if (!this.hasSigner()) {
      throw new AppError(
        "REAL_PROVIDER_AUTH_REQUIRED",
        "Real Shelby write operations require SHELBY_PRIVATE_KEY and SHELBY_ACCOUNT_ID."
      );
    }

    this.signer = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(this.config.shelbyPrivateKey!),
      address: this.config.shelbyAccountId
    });
    return this.signer;
  }

  private resolveBlobTarget(input: BlobIdentifierInput): ResolvedBlobTarget {
    const rawValue = input.blobKey ?? input.blobId;
    if (!rawValue) {
      throw new AppError("VALIDATION_ERROR", "Either blobId or blobKey is required.");
    }

    if (rawValue.startsWith("0x") && rawValue.includes(".")) {
      const [accountId, ...rest] = rawValue.split(".");
      const blobName = rest.join(".");
      if (accountId && blobName) {
        return {
          accountId,
          blobName,
          blobKey: rawValue
        };
      }
    }

    const accountId = this.requireAccountId();
    return {
      accountId,
      blobName: rawValue,
      blobKey: createBlobKey({
        account: accountId,
        blobName: rawValue
      })
    };
  }

  private mapBlobSummary(blob: ShelbySdkBlobMetadata): BlobSummary {
    const key = createBlobKey({
      account: blob.owner.toString(),
      blobName: blob.blobNameSuffix
    });

    return {
      id: key,
      key,
      name: blob.blobNameSuffix,
      size: blob.size,
      contentType: inferContentType(blob.blobNameSuffix),
      createdAt: new Date(blob.creationMicros / 1000).toISOString()
    };
  }

  private mapBlobMetadata(blob: ShelbySdkBlobMetadata): BlobMetadata {
    const summary = this.mapBlobSummary(blob);
    const explorerUrl = this.config.shelbyNetwork
      ? getShelbyBlobExplorerUrl(
          this.config.shelbyNetwork,
          blob.owner.toString(),
          blob.blobNameSuffix
        )
      : undefined;

    return {
      ...summary,
      expiresAt: new Date(blob.expirationMicros / 1000).toISOString(),
      providerMetadata: stripUndefined({
        owner: blob.owner.toString(),
        blobMerkleRoot: Buffer.from(blob.blobMerkleRoot).toString("hex"),
        blobName: blob.name,
        blobNameSuffix: blob.blobNameSuffix,
        encoding: blob.encoding.variant,
        sliceAddress: blob.sliceAddress.toString(),
        isWritten: blob.isWritten,
        isDeleted: blob.isDeleted ?? false,
        explorerUrl
      })
    };
  }

  private wrapShelbyError(
    error: unknown,
    operation: string,
    details?: Record<string, unknown>
  ): AppError {
    const message = error instanceof Error ? error.message : String(error);

    if (isBlobNotFoundError(message)) {
      return new AppError("BLOB_NOT_FOUND", "Blob not found.", details);
    }

    this.logger.warn(
      {
        operation,
        error: message,
        details
      },
      "Real Shelby provider operation failed.",
      { notifyClient: true }
    );

    return new AppError(
      "REAL_PROVIDER_ERROR",
      `Real Shelby provider failed during ${operation}: ${message}`,
      details
    );
  }

  private encodeOffset(offset: number): string {
    return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
  }

  private decodeOffset(cursor: string | undefined): number {
    if (!cursor) {
      return 0;
    }

    try {
      const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
        offset?: number;
      };
      return parsed.offset ?? 0;
    } catch {
      throw new AppError("INVALID_CURSOR", "Cursor could not be parsed.");
    }
  }

  private logStreamingFallback(): void {
    if (this.hasLoggedStreamingFallback) {
      return;
    }

    this.hasLoggedStreamingFallback = true;
    this.logger.warn(
      {
        provider: "real-shelby"
      },
      "Real Shelby uploads currently fall back to in-memory buffering at the SDK adapter boundary."
    );
  }

  private logBatchBufferingFallback(): void {
    if (this.hasLoggedBatchBufferingWarning) {
      return;
    }

    this.hasLoggedBatchBufferingWarning = true;
    this.logger.warn(
      {
        provider: "real-shelby"
      },
      "Real Shelby batch uploads currently require in-memory buffering before submission."
    );
  }

  private getExpirationMicros(): number {
    return Date.now() * 1000 + 24 * 60 * 60 * 1_000_000;
  }
}
