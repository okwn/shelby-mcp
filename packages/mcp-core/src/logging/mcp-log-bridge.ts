import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LogEntry, LogSink } from "../../../shared/src/index.js";

function mapLogLevel(level: LogEntry["level"]): "debug" | "info" | "warning" | "error" {
  switch (level) {
    case "debug":
      return "debug";
    case "info":
      return "info";
    case "warn":
      return "warning";
    case "error":
      return "error";
  }
}

function looksLikeAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("/") || value.startsWith("\\\\");
}

function sanitizeClientValue(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return "[Truncated]";
  }

  if (typeof value === "string") {
    return looksLikeAbsolutePath(value) ? "[RedactedPath]" : value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeClientValue(entry, depth + 1));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeClientValue(entry, depth + 1)])
    );
  }

  return value;
}

function sanitizeClientData(
  data: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!data) {
    return undefined;
  }

  return sanitizeClientValue(data) as Record<string, unknown>;
}

export class McpLogBridge implements LogSink {
  private server?: McpServer;

  attach(server: McpServer): void {
    this.server = server;
  }

  async emit(entry: LogEntry): Promise<void> {
    if (!this.server?.isConnected()) {
      return;
    }

    if (!entry.notifyClient && entry.level === "debug") {
      return;
    }

    await this.server.sendLoggingMessage({
      level: mapLogLevel(entry.level),
      logger: entry.logger,
      data: {
        message: entry.message,
        ...sanitizeClientData(entry.data)
      }
    });
  }
}
