import type { TelemetryStatus } from "../../../shared/src/index.js";

export type ProviderMode = "mock" | "real";

export type BlobId = string;
export type BlobKey = string;

export type ErrorDetails = Record<string, unknown>;

export type SerializableError = {
  code: string;
  message: string;
  details?: ErrorDetails;
};

export type ToolSuccess<T> = {
  ok: true;
  data: T;
};

export type ToolFailure = {
  ok: false;
  error: SerializableError;
};

export type ToolEnvelope<T> = ToolSuccess<T> | ToolFailure;

export type ProviderCapabilities = {
  supportsDelete: boolean;
  supportsSignedUrls: boolean;
  supportsMetadata: boolean;
  supportsBatch: boolean;
  supportsVerification: boolean;
  supportsMedia: boolean;
  supportsPagination: boolean;
  supportsStreamingUpload: boolean;
  supportsStrictMetadataValidation: boolean;
  mode: ProviderMode;
  notes?: string[];
};

export type NetworkInfo = {
  name?: string;
  apiUrl?: string;
  rpcUrl?: string;
  indexerUrl?: string;
  explorerUrl?: string;
};

export type BlobChecksum = {
  algorithm: "sha256";
  value: string;
};

export type BlobSummary = {
  id: BlobId;
  key: BlobKey;
  name: string;
  size: number;
  contentType?: string;
  createdAt: string;
};

export type BlobMetadata = BlobSummary & {
  expiresAt?: string;
  checksum?: BlobChecksum;
  providerMetadata?: Record<string, unknown>;
  metadata?: Record<string, string>;
};

export type AccountInfo = {
  provider: string;
  mode: ProviderMode;
  accountId?: string;
  network?: NetworkInfo;
  status: "ready" | "degraded";
  capabilities: ProviderCapabilities;
  notes?: string[];
};

export type SafePathInfo = {
  ok: true;
  safePath: string;
  resolvedPath: string;
  rootPath: string;
  effectiveScope: string;
};

export type SandboxStatus = {
  rootPath: string;
  activeScopePath: string;
  effectiveScope: string;
  storageDir: string;
  tempDir: string;
  maxUploadSizeMb: number;
  maxReadTextBytes: number;
  allowDestructiveTools: boolean;
  restrictions: string[];
};

export type BlobIdentifierInput = {
  blobId?: BlobId;
  blobKey?: BlobKey;
};

export type UploadMetadata = Record<string, string>;

export type UploadPolicy = {
  strictMetadata: boolean;
  requiredMetadataKeys: string[];
  defaultMetadataKeys: string[];
  maxUploadSizeMb: number;
  maxUploadSizeBytes: number;
  streamUploadChunkSizeBytes: number;
  supportsStreamingUpload: boolean;
  supportsStrictMetadataValidation: boolean;
  destructiveToolsEnabled: boolean;
};

export type ListBlobsInput = {
  prefix?: string;
  limit?: number;
  cursor?: string;
};

export type ListBlobsResult = {
  items: BlobSummary[];
  nextCursor?: string;
  totalKnown?: number;
};

export type UploadFileInput = {
  path: string;
  targetName?: string;
  contentType?: string;
  metadata?: UploadMetadata;
};

export type UploadFileStreamInput = UploadFileInput & {
  chunkSizeBytes: number;
  sizeBytes: number;
};

export type UploadTextInput = {
  text: string;
  targetName: string;
  contentType?: string;
  metadata?: UploadMetadata;
};

export type UploadResult = BlobMetadata & {
  retrieval?: {
    url?: string;
    note?: string;
  };
};

export type DownloadBlobInput = BlobIdentifierInput & {
  outputPath?: string;
};

export type DownloadResult = {
  savedPath: string;
  bytesWritten: number;
  metadata: BlobMetadata;
};

export type ReadBlobTextInput = BlobIdentifierInput & {
  maxBytes?: number;
};

export type ReadBlobTextResult = {
  text: string;
  truncated: boolean;
  bytesRead: number;
  metadata: BlobMetadata;
};

export type BlobUrlResult = {
  url: string;
  expiresAt?: string;
  note?: string;
};

export type DeleteBlobResult = {
  success: boolean;
  deletedId: BlobId;
};

export type BatchUploadInput = {
  paths: string[];
  prefix?: string;
  continueOnError?: boolean;
  metadata?: UploadMetadata;
};

export type BatchUploadFailure = {
  path: string;
  error: SerializableError;
};

export type BatchUploadResult = {
  successes: UploadResult[];
  failures: BatchUploadFailure[];
};

export type VerifyBlobInput = BlobIdentifierInput & {
  localPath?: string;
};

export type VerificationResult = {
  verified: boolean;
  checksumLocal?: string;
  checksumRemote?: string;
  note?: string;
  metadata?: BlobMetadata;
};

export type WriteJsonInput = {
  data: unknown;
  targetName: string;
  metadata?: UploadMetadata;
};

export type LocalUploadCandidate = {
  path: string;
  relativePath: string;
  size: number;
  contentType?: string;
  modifiedAt: string;
};

export type ListLocalUploadCandidatesInput = {
  directory: string;
  recursive?: boolean;
  maxEntries?: number;
};

export type ListLocalUploadCandidatesResult = {
  files: LocalUploadCandidate[];
  totalDiscovered: number;
  truncated: boolean;
};

export type HealthcheckResult = {
  ok: boolean;
  provider: string;
  mode: ProviderMode;
  config: Record<string, unknown>;
  warnings: string[];
  uploadPolicy?: UploadPolicy;
  telemetry?: TelemetryStatus;
};

export type ShelbyCapabilities = ProviderCapabilities;
export type ShelbyAccountInfo = AccountInfo;
export type DownloadBlobResult = DownloadResult;
export type VerifyBlobResult = VerificationResult;

export interface ShelbyProvider {
  getAccountInfo(): Promise<AccountInfo>;
  listBlobs(input: ListBlobsInput): Promise<ListBlobsResult>;
  getBlobMetadata(input: BlobIdentifierInput): Promise<BlobMetadata>;
  uploadFile(input: UploadFileInput): Promise<UploadResult>;
  uploadFileStream?(input: UploadFileStreamInput): Promise<UploadResult>;
  uploadText(input: UploadTextInput): Promise<UploadResult>;
  downloadBlob(input: DownloadBlobInput): Promise<DownloadResult>;
  readBlobText(input: ReadBlobTextInput): Promise<ReadBlobTextResult>;
  getBlobUrl(input: BlobIdentifierInput): Promise<BlobUrlResult>;
  deleteBlob(input: BlobIdentifierInput): Promise<DeleteBlobResult>;
  batchUpload(input: BatchUploadInput): Promise<BatchUploadResult>;
  verifyBlob(input: VerifyBlobInput): Promise<VerificationResult>;
  healthcheck(): Promise<HealthcheckResult>;
  capabilities(): ProviderCapabilities;
}
