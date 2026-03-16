import { describe, expect, test, vi } from "vitest";
import {
  createLogger,
  createTelemetryClient,
  sanitizeTelemetryPayload
} from "../../packages/shared/src/index.js";

describe("telemetry", () => {
  test("disabled telemetry sends nothing", async () => {
    const transport = vi.fn(async (...args: [string, string]) => {
      void args;
    });
    const client = createTelemetryClient(
      {
        nodeEnv: "test",
        telemetryEnabled: false,
        telemetryEndpoint: "https://example.com/telemetry",
        telemetryEnvironment: "test",
        telemetrySampleRate: 1
      },
      createLogger({ logLevel: "silent" }),
      { name: "shelby-mcp", version: "test" },
      transport
    );

    await client.captureToolError({
      toolName: "shelby_upload_file",
      providerMode: "mock",
      errorCode: "BLOB_NOT_FOUND",
      streamingSupported: true,
      strictMetadata: false
    });

    expect(transport).not.toHaveBeenCalled();
  });

  test("sanitizes telemetry payloads", async () => {
    const transport = vi.fn(async (...args: [string, string]) => {
      void args;
    });
    const client = createTelemetryClient(
      {
        nodeEnv: "test",
        telemetryEnabled: true,
        telemetryEndpoint: "https://example.com/telemetry",
        telemetryEnvironment: "test",
        telemetrySampleRate: 1
      },
      createLogger({ logLevel: "silent" }),
      { name: "shelby-mcp", version: "test" },
      transport
    );

    await client.capture({
      type: "tool_error",
      timestamp: new Date().toISOString(),
      app: { name: "shelby-mcp", version: "test" },
      environment: "test",
      providerMode: "mock",
      payload: {
        path: "C:\\secret\\file.txt",
        metadata: {
          classification: "secret"
        },
        authorization: "Bearer secret",
        nested: {
          localPath: "/tmp/private.txt"
        }
      }
    });

    const rawPayload = transport.mock.calls[0]?.[1];
    expect(typeof rawPayload).toBe("string");

    const payload = JSON.parse(rawPayload as string) as {
      payload: Record<string, unknown>;
    };

    expect(payload.payload.path).toBe("[RedactedPath]");
    expect(payload.payload.metadata).toBe("[Redacted]");
    expect(payload.payload.authorization).toBe("[Redacted]");
    expect((payload.payload.nested as Record<string, unknown>).localPath).toBe("[RedactedPath]");

    expect(
      sanitizeTelemetryPayload({
        path: "/Users/private/file.txt",
        metadata: { source: "test" }
      })
    ).toEqual({
      path: "[RedactedPath]",
      metadata: "[Redacted]"
    });
  });
});
