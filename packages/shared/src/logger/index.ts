import pino, { type Logger as PinoLogger } from "pino";
import type { AppConfig } from "../config/index.js";

export type StructuredLogLevel = "debug" | "info" | "warn" | "error";

export type LogEntry = {
  level: StructuredLogLevel;
  logger: string;
  message: string;
  data?: Record<string, unknown>;
  notifyClient?: boolean;
};

export interface LogSink {
  emit(entry: LogEntry): void | Promise<void>;
}

export type LogOptions = {
  notifyClient?: boolean;
};

const REDACTED_KEYS = [
  "apiKey",
  "authorization",
  "privateKey",
  "secret",
  "token",
  "SHELBY_API_KEY",
  "SHELBY_PRIVATE_KEY"
];

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return "[Truncated]";
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, depth + 1));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        if (REDACTED_KEYS.some((candidate) => candidate.toLowerCase() === key.toLowerCase())) {
          return [key, "[Redacted]"];
        }
        return [key, sanitizeValue(entry, depth + 1)];
      })
    );
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message
    };
  }

  return value;
}

function sanitizeData(data?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!data) {
    return undefined;
  }

  return sanitizeValue(data) as Record<string, unknown>;
}

export class ShelbyLogger {
  constructor(
    private readonly logger: PinoLogger,
    private readonly sinks: Set<LogSink> = new Set(),
    private readonly loggerName = "shelby-mcp"
  ) {}

  child(bindings: Record<string, unknown>, name?: string): ShelbyLogger {
    return new ShelbyLogger(
      this.logger.child(sanitizeData(bindings) ?? {}),
      this.sinks,
      name ?? this.loggerName
    );
  }

  addSink(sink: LogSink): void {
    this.sinks.add(sink);
  }

  debug(data: Record<string, unknown> | undefined, message: string, options?: LogOptions): void {
    this.write("debug", data, message, options);
  }

  info(data: Record<string, unknown> | undefined, message: string, options?: LogOptions): void {
    this.write("info", data, message, options);
  }

  warn(data: Record<string, unknown> | undefined, message: string, options?: LogOptions): void {
    this.write("warn", data, message, options);
  }

  error(data: Record<string, unknown> | undefined, message: string, options?: LogOptions): void {
    this.write("error", data, message, options);
  }

  private write(
    level: StructuredLogLevel,
    data: Record<string, unknown> | undefined,
    message: string,
    options?: LogOptions
  ): void {
    const payload = sanitizeData(data);
    this.logger[level](payload ?? {}, message);

    const entry: LogEntry = {
      level,
      logger: this.loggerName,
      message,
      data: payload,
      notifyClient: options?.notifyClient
    };

    for (const sink of this.sinks) {
      try {
        const result = sink.emit(entry);
        if (result instanceof Promise) {
          void result.catch(() => undefined);
        }
      } catch {
        // Ignore sink failures so logging never breaks MCP traffic.
      }
    }
  }
}

export function createLogger(config: Pick<AppConfig, "logLevel">): ShelbyLogger {
  const pinoLogger = pino(
    {
      name: "shelby-mcp",
      level: config.logLevel,
      base: null,
      timestamp: pino.stdTimeFunctions.isoTime
    },
    pino.destination(2)
  );

  return new ShelbyLogger(pinoLogger);
}

export type AppLogger = ShelbyLogger;
