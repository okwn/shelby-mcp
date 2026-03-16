import type { AppConfig } from "../config/index.js";
import type { AppLogger } from "../logger/index.js";

export type TelemetryTransportKind = "noop" | "http";

export type TelemetryStatus = {
  requested: boolean;
  enabled: boolean;
  endpointConfigured: boolean;
  environment: string;
  sampleRate: number;
  transport: TelemetryTransportKind;
  reason?: string;
};

export type TelemetryEvent = {
  type: "tool_error" | "startup_capability_snapshot";
  timestamp: string;
  app: {
    name: string;
    version: string;
  };
  environment: string;
  providerMode: "mock" | "real";
  payload: Record<string, unknown>;
};

export type CaptureToolErrorInput = {
  toolName: string;
  providerMode: "mock" | "real";
  errorCode: string;
  fileSizeBytes?: number;
  streamingSupported: boolean;
  strictMetadata: boolean;
};

export type CaptureStartupSnapshotInput = {
  providerMode: "mock" | "real";
  supportsStreamingUpload: boolean;
  supportsBatch: boolean;
  supportsVerification: boolean;
  strictMetadata: boolean;
  requiredMetadataKeyCount: number;
  destructiveToolsEnabled: boolean;
};

export interface TelemetryClient {
  getStatus(): TelemetryStatus;
  capture(event: TelemetryEvent): Promise<void>;
  captureToolError(input: CaptureToolErrorInput): Promise<void>;
  captureStartupSnapshot(input: CaptureStartupSnapshotInput): Promise<void>;
}

type HttpTelemetryTransport = (endpoint: string, payload: string) => Promise<void>;

const REDACTED_PATH_KEYS = ["path", "filepath", "filePath", "localPath"];
const REDACTED_KEYS = [
  "authorization",
  "apiKey",
  "privateKey",
  "secret",
  "token",
  "metadata",
  "content",
  "text",
  "body",
  "env",
  "environmentValues"
];

function looksLikeAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:\\/.test(value) || value.startsWith("/") || value.startsWith("\\\\");
}

function sanitizeValue(key: string, value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return "[Truncated]";
  }

  const normalizedKey = key.toLowerCase();
  if (REDACTED_KEYS.some((candidate) => candidate.toLowerCase() === normalizedKey)) {
    return "[Redacted]";
  }
  if (REDACTED_PATH_KEYS.some((candidate) => candidate.toLowerCase() === normalizedKey)) {
    return "[RedactedPath]";
  }

  if (typeof value === "string") {
    if (looksLikeAbsolutePath(value)) {
      return "[RedactedPath]";
    }
    if (value.length > 200) {
      return "[TruncatedString]";
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(key, entry, depth + 1));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeValue(entryKey, entryValue, depth + 1)
      ])
    );
  }

  return value;
}

export function sanitizeTelemetryPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, sanitizeValue(key, value)])
  );
}

function bucketFileSize(fileSizeBytes: number | undefined): string | undefined {
  if (fileSizeBytes === undefined) {
    return undefined;
  }
  if (fileSizeBytes < 64 * 1024) {
    return "<64kb";
  }
  if (fileSizeBytes < 1024 * 1024) {
    return "64kb-1mb";
  }
  if (fileSizeBytes < 10 * 1024 * 1024) {
    return "1mb-10mb";
  }
  return ">=10mb";
}

async function defaultHttpTransport(endpoint: string, payload: string): Promise<void> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: payload
  });

  if (!response.ok) {
    throw new Error(`Telemetry endpoint responded with status ${response.status}.`);
  }
}

export class NoopTelemetryClient implements TelemetryClient {
  constructor(private readonly status: TelemetryStatus) {}

  getStatus(): TelemetryStatus {
    return this.status;
  }

  async capture(): Promise<void> {}

  async captureToolError(): Promise<void> {}

  async captureStartupSnapshot(): Promise<void> {}
}

export class HttpTelemetryClient implements TelemetryClient {
  constructor(
    private readonly status: TelemetryStatus,
    private readonly logger: AppLogger,
    private readonly app: { name: string; version: string },
    private readonly endpoint: string,
    private readonly transport: HttpTelemetryTransport = defaultHttpTransport
  ) {}

  getStatus(): TelemetryStatus {
    return this.status;
  }

  async capture(event: TelemetryEvent): Promise<void> {
    if (!this.status.enabled) {
      return;
    }
    if (Math.random() > this.status.sampleRate) {
      return;
    }

    const sanitizedEvent: TelemetryEvent = {
      ...event,
      payload: sanitizeTelemetryPayload(event.payload)
    };

    try {
      await this.transport(this.endpoint, JSON.stringify(sanitizedEvent));
    } catch (error) {
      this.logger.warn(
        {
          error: (error as Error).message
        },
        "Telemetry event delivery failed."
      );
    }
  }

  async captureToolError(input: CaptureToolErrorInput): Promise<void> {
    await this.capture({
      type: "tool_error",
      timestamp: new Date().toISOString(),
      app: this.app,
      environment: this.status.environment,
      providerMode: input.providerMode,
      payload: {
        toolName: input.toolName,
        errorCode: input.errorCode,
        fileSizeBucket: bucketFileSize(input.fileSizeBytes),
        streamingSupported: input.streamingSupported,
        strictMetadata: input.strictMetadata
      }
    });
  }

  async captureStartupSnapshot(input: CaptureStartupSnapshotInput): Promise<void> {
    await this.capture({
      type: "startup_capability_snapshot",
      timestamp: new Date().toISOString(),
      app: this.app,
      environment: this.status.environment,
      providerMode: input.providerMode,
      payload: {
        supportsStreamingUpload: input.supportsStreamingUpload,
        supportsBatch: input.supportsBatch,
        supportsVerification: input.supportsVerification,
        strictMetadata: input.strictMetadata,
        requiredMetadataKeyCount: input.requiredMetadataKeyCount,
        destructiveToolsEnabled: input.destructiveToolsEnabled
      }
    });
  }
}

export function createTelemetryClient(
  config: Pick<
    AppConfig,
    | "nodeEnv"
    | "telemetryEnabled"
    | "telemetryEndpoint"
    | "telemetryEnvironment"
    | "telemetrySampleRate"
  >,
  logger: AppLogger,
  app: { name: string; version: string },
  transport?: HttpTelemetryTransport
): TelemetryClient {
  if (!config.telemetryEnabled) {
    return new NoopTelemetryClient({
      requested: false,
      enabled: false,
      endpointConfigured: Boolean(config.telemetryEndpoint),
      environment: config.telemetryEnvironment,
      sampleRate: config.telemetrySampleRate,
      transport: "noop"
    });
  }

  if (!config.telemetryEndpoint) {
    return new NoopTelemetryClient({
      requested: true,
      enabled: false,
      endpointConfigured: false,
      environment: config.telemetryEnvironment,
      sampleRate: config.telemetrySampleRate,
      transport: "noop",
      reason: "Telemetry is enabled but TELEMETRY_ENDPOINT is not configured."
    });
  }

  return new HttpTelemetryClient(
    {
      requested: true,
      enabled: true,
      endpointConfigured: true,
      environment: config.telemetryEnvironment,
      sampleRate: config.telemetrySampleRate,
      transport: "http"
    },
    logger.child({ component: "telemetry" }, "telemetry"),
    app,
    config.telemetryEndpoint,
    transport
  );
}
