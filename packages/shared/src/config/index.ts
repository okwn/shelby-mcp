import { config as loadDotEnv } from "dotenv";
import { z } from "zod";
import { isPathInsideRoot, resolveUserPath } from "../fs/index.js";
import { parseBoolean, parseCommaSeparatedList } from "../utils/index.js";

loadDotEnv();

function emptyStringToUndefined(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  SHELBY_PROVIDER: z.enum(["mock", "real"]).default("mock"),
  SHELBY_NETWORK: z.preprocess(emptyStringToUndefined, z.string().trim().min(1).optional()),
  SHELBY_ACCOUNT_ID: z.preprocess(emptyStringToUndefined, z.string().trim().min(1).optional()),
  SHELBY_API_URL: z.preprocess(emptyStringToUndefined, z.string().trim().url().optional()),
  SHELBY_API_KEY: z.preprocess(emptyStringToUndefined, z.string().trim().min(1).optional()),
  SHELBY_PRIVATE_KEY: z.preprocess(emptyStringToUndefined, z.string().trim().min(1).optional()),
  SHELBY_WORKDIR: z.string().trim().min(1).default(".shelby-workdir"),
  SHELBY_STORAGE_DIR: z.string().trim().min(1).default(".shelby-system/storage"),
  TEMP_DIR: z.string().trim().min(1).default(".shelby-system/tmp"),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().positive().max(1024).default(50),
  MAX_READ_TEXT_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024)
    .default(64 * 1024),
  STREAM_UPLOAD_CHUNK_SIZE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(8 * 1024 * 1024)
    .default(256 * 1024),
  SHELBY_STRICT_METADATA: z.string().optional(),
  SHELBY_REQUIRED_METADATA_KEYS: z.string().optional(),
  SHELBY_DEFAULT_CONTENT_OWNER: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(1).optional()
  ),
  SHELBY_DEFAULT_CLASSIFICATION: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(1).optional()
  ),
  SHELBY_DEFAULT_SOURCE: z.preprocess(emptyStringToUndefined, z.string().trim().min(1).optional()),
  TELEMETRY_ENABLED: z.string().optional(),
  TELEMETRY_ENDPOINT: z.preprocess(emptyStringToUndefined, z.string().trim().url().optional()),
  TELEMETRY_ENVIRONMENT: z.preprocess(emptyStringToUndefined, z.string().trim().min(1).optional()),
  TELEMETRY_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(1),
  ALLOW_DESTRUCTIVE_TOOLS: z.string().optional()
});

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  shelbyProvider: "mock" | "real";
  shelbyNetwork?: string;
  shelbyAccountId?: string;
  shelbyApiUrl?: string;
  shelbyApiKey?: string;
  shelbyPrivateKey?: string;
  shelbyWorkdir: string;
  shelbyStorageDir: string;
  tempDir: string;
  maxUploadSizeMb: number;
  maxUploadSizeBytes: number;
  maxReadTextBytes: number;
  streamUploadChunkSizeBytes: number;
  strictMetadata: boolean;
  requiredMetadataKeys: string[];
  defaultContentOwner?: string;
  defaultClassification?: string;
  defaultSource?: string;
  telemetryEnabled: boolean;
  telemetryEndpoint?: string;
  telemetryEnvironment: string;
  telemetrySampleRate: number;
  allowDestructiveTools: boolean;
};

export class ConfigValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "ConfigValidationError";
    this.issues = issues;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): AppConfig {
  const parsed = configSchema.safeParse(env);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const pathLabel = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${pathLabel}: ${issue.message}`;
    });
    throw new ConfigValidationError(issues);
  }

  let allowDestructiveTools: boolean;
  let strictMetadata: boolean;
  let telemetryEnabled: boolean;
  try {
    allowDestructiveTools = parseBoolean(parsed.data.ALLOW_DESTRUCTIVE_TOOLS, false);
    strictMetadata = parseBoolean(parsed.data.SHELBY_STRICT_METADATA, false);
    telemetryEnabled = parseBoolean(parsed.data.TELEMETRY_ENABLED, false);
  } catch (error) {
    throw new ConfigValidationError([(error as Error).message]);
  }

  const requiredMetadataKeys = parseCommaSeparatedList(parsed.data.SHELBY_REQUIRED_METADATA_KEYS);

  const shelbyWorkdir = resolveUserPath(parsed.data.SHELBY_WORKDIR, cwd);
  const shelbyStorageDir = resolveUserPath(parsed.data.SHELBY_STORAGE_DIR, shelbyWorkdir);
  const tempDir = resolveUserPath(parsed.data.TEMP_DIR, shelbyWorkdir);

  const pathIssues: string[] = [];
  if (!isPathInsideRoot(shelbyWorkdir, shelbyStorageDir)) {
    pathIssues.push("SHELBY_STORAGE_DIR must stay within SHELBY_WORKDIR.");
  }
  if (!isPathInsideRoot(shelbyWorkdir, tempDir)) {
    pathIssues.push("TEMP_DIR must stay within SHELBY_WORKDIR.");
  }
  if (strictMetadata && requiredMetadataKeys.length === 0) {
    pathIssues.push(
      "SHELBY_REQUIRED_METADATA_KEYS must include at least one key when SHELBY_STRICT_METADATA=true."
    );
  }

  if (pathIssues.length > 0) {
    throw new ConfigValidationError(pathIssues);
  }

  return {
    nodeEnv: parsed.data.NODE_ENV,
    logLevel: parsed.data.LOG_LEVEL,
    shelbyProvider: parsed.data.SHELBY_PROVIDER,
    shelbyNetwork: parsed.data.SHELBY_NETWORK,
    shelbyAccountId: parsed.data.SHELBY_ACCOUNT_ID,
    shelbyApiUrl: parsed.data.SHELBY_API_URL,
    shelbyApiKey: parsed.data.SHELBY_API_KEY,
    shelbyPrivateKey: parsed.data.SHELBY_PRIVATE_KEY,
    shelbyWorkdir,
    shelbyStorageDir,
    tempDir,
    maxUploadSizeMb: parsed.data.MAX_UPLOAD_SIZE_MB,
    maxUploadSizeBytes: parsed.data.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
    maxReadTextBytes: parsed.data.MAX_READ_TEXT_BYTES,
    streamUploadChunkSizeBytes: parsed.data.STREAM_UPLOAD_CHUNK_SIZE_BYTES,
    strictMetadata,
    requiredMetadataKeys,
    defaultContentOwner: parsed.data.SHELBY_DEFAULT_CONTENT_OWNER,
    defaultClassification: parsed.data.SHELBY_DEFAULT_CLASSIFICATION,
    defaultSource: parsed.data.SHELBY_DEFAULT_SOURCE,
    telemetryEnabled,
    telemetryEndpoint: parsed.data.TELEMETRY_ENDPOINT,
    telemetryEnvironment: parsed.data.TELEMETRY_ENVIRONMENT ?? parsed.data.NODE_ENV,
    telemetrySampleRate: parsed.data.TELEMETRY_SAMPLE_RATE,
    allowDestructiveTools
  };
}

export function getSafeConfigSummary(config: AppConfig): Record<string, unknown> {
  return {
    nodeEnv: config.nodeEnv,
    logLevel: config.logLevel,
    shelbyProvider: config.shelbyProvider,
    shelbyNetwork: config.shelbyNetwork ?? null,
    shelbyAccountId: config.shelbyAccountId ?? null,
    shelbyApiUrlConfigured: Boolean(config.shelbyApiUrl),
    shelbyApiKeyConfigured: Boolean(config.shelbyApiKey),
    shelbyPrivateKeyConfigured: Boolean(config.shelbyPrivateKey),
    shelbyWorkdir: config.shelbyWorkdir,
    shelbyStorageDir: config.shelbyStorageDir,
    tempDir: config.tempDir,
    maxUploadSizeMb: config.maxUploadSizeMb,
    maxReadTextBytes: config.maxReadTextBytes,
    streamUploadChunkSizeBytes: config.streamUploadChunkSizeBytes,
    strictMetadata: config.strictMetadata,
    requiredMetadataKeys: config.requiredMetadataKeys,
    defaultMetadataConfigured: {
      contentOwner: Boolean(config.defaultContentOwner),
      classification: Boolean(config.defaultClassification),
      source: Boolean(config.defaultSource)
    },
    telemetryEnabled: config.telemetryEnabled,
    telemetryEndpointConfigured: Boolean(config.telemetryEndpoint),
    telemetryEnvironment: config.telemetryEnvironment,
    telemetrySampleRate: config.telemetrySampleRate,
    allowDestructiveTools: config.allowDestructiveTools
  };
}
