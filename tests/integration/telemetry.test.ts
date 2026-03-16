import { afterEach, describe, expect, test } from "vitest";
import type {
  CaptureToolErrorInput,
  TelemetryClient,
  TelemetryStatus
} from "../../packages/shared/src/index.js";
import {
  cleanupDirectory,
  createTempWorkspace,
  createTestConfig,
  createTestCoreServer
} from "../helpers.js";

class RecordingTelemetryClient implements TelemetryClient {
  readonly toolErrors: CaptureToolErrorInput[] = [];

  getStatus(): TelemetryStatus {
    return {
      requested: true,
      enabled: true,
      endpointConfigured: true,
      environment: "test",
      sampleRate: 1,
      transport: "http"
    };
  }

  async capture(): Promise<void> {}

  async captureToolError(input: CaptureToolErrorInput): Promise<void> {
    this.toolErrors.push(input);
  }

  async captureStartupSnapshot(): Promise<void> {}
}

class FailingTelemetryClient implements TelemetryClient {
  getStatus(): TelemetryStatus {
    return {
      requested: true,
      enabled: true,
      endpointConfigured: true,
      environment: "test",
      sampleRate: 1,
      transport: "http"
    };
  }

  async capture(): Promise<void> {}

  async captureToolError(): Promise<void> {
    throw new Error("telemetry failed");
  }

  async captureStartupSnapshot(): Promise<void> {}
}

describe("telemetry integration", () => {
  const created: string[] = [];

  afterEach(async () => {
    await Promise.all(created.map((directory) => cleanupDirectory(directory)));
    created.length = 0;
  });

  test("tool errors create telemetry events when enabled", async () => {
    const workspace = await createTempWorkspace();
    created.push(workspace);

    const telemetry = new RecordingTelemetryClient();
    const server = await createTestCoreServer(
      createTestConfig({
        shelbyWorkdir: `${workspace}/.shelby`
      }),
      {
        telemetry
      }
    );

    const result = await server.callTool("shelby_download_blob", {
      blobKey: "missing.txt"
    });

    expect(result.ok).toBe(false);
    expect(telemetry.toolErrors).toHaveLength(1);
    expect(telemetry.toolErrors[0]?.toolName).toBe("shelby_download_blob");
    expect(telemetry.toolErrors[0]?.errorCode).toBe("BLOB_NOT_FOUND");
  });

  test("telemetry failures do not crash tool execution", async () => {
    const workspace = await createTempWorkspace();
    created.push(workspace);

    const server = await createTestCoreServer(
      createTestConfig({
        shelbyWorkdir: `${workspace}/.shelby`
      }),
      {
        telemetry: new FailingTelemetryClient()
      }
    );

    const result = await server.callTool("shelby_download_blob", {
      blobKey: "missing.txt"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("BLOB_NOT_FOUND");
    }
  });
});
