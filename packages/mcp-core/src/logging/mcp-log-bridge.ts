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
        ...entry.data
      }
    });
  }
}
