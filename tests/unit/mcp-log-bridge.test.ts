import { describe, expect, test, vi } from "vitest";
import { McpLogBridge } from "../../packages/mcp-core/src/index.js";

describe("McpLogBridge", () => {
  test("redacts absolute path values from client-visible logging messages", async () => {
    const sendLoggingMessage = vi.fn(async (_message: unknown) => undefined);
    const bridge = new McpLogBridge();
    bridge.attach({
      isConnected: () => true,
      sendLoggingMessage
    } as never);

    await bridge.emit({
      level: "warn",
      logger: "sandbox",
      message: "Sandbox rejected path outside root.",
      notifyClient: true,
      data: {
        resolvedPath: "C:\\private\\outside.txt",
        safePath: "docs/note.txt",
        nested: {
          localPath: "/tmp/private.txt"
        }
      }
    });

    const payload = sendLoggingMessage.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };

    expect(payload.data.message).toBe("Sandbox rejected path outside root.");
    expect(payload.data.resolvedPath).toBe("[RedactedPath]");
    expect(payload.data.safePath).toBe("docs/note.txt");
    expect((payload.data.nested as Record<string, unknown>).localPath).toBe("[RedactedPath]");
  });
});
