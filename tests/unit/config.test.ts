import path from "node:path";
import { describe, expect, test } from "vitest";
import { ConfigValidationError, loadConfig } from "../../packages/shared/src/index.js";

describe("loadConfig", () => {
  test("parses defaults and resolves work directories", () => {
    const cwd = path.posix.join("/workspace", "repo");
    const config = loadConfig(
      {
        SHELBY_PROVIDER: "mock",
        ALLOW_DESTRUCTIVE_TOOLS: "false"
      },
      cwd
    );

    expect(config.shelbyProvider).toBe("mock");
    expect(config.shelbyWorkdir).toBe(path.posix.join(cwd, ".shelby-workdir"));
    expect(config.shelbyStorageDir).toBe(
      path.posix.join(cwd, ".shelby-workdir", ".shelby-system", "storage")
    );
    expect(config.tempDir).toBe(path.posix.join(cwd, ".shelby-workdir", ".shelby-system", "tmp"));
    expect(config.streamUploadChunkSizeBytes).toBe(256 * 1024);
    expect(config.strictMetadata).toBe(false);
    expect(config.requiredMetadataKeys).toEqual([]);
    expect(config.telemetryEnabled).toBe(false);
    expect(config.allowDestructiveTools).toBe(false);
  });

  test("preserves Windows-style absolute workdir values on non-Windows hosts", () => {
    const cwd = path.posix.join("/home", "runner", "work", "shelby-mcp");
    const workdir = path.win32.normalize("C:/workspace/repo/.shelby-workdir");
    const config = loadConfig(
      {
        SHELBY_PROVIDER: "mock",
        SHELBY_WORKDIR: workdir,
        ALLOW_DESTRUCTIVE_TOOLS: "false"
      },
      cwd
    );

    expect(config.shelbyWorkdir).toBe(workdir);
    expect(config.shelbyStorageDir).toBe(
      path.win32.normalize("C:/workspace/repo/.shelby-workdir/.shelby-system/storage")
    );
    expect(config.tempDir).toBe(
      path.win32.normalize("C:/workspace/repo/.shelby-workdir/.shelby-system/tmp")
    );
  });

  test("resolves relative directories correctly when cwd is Windows-style", () => {
    const cwd = path.win32.normalize("C:/workspace/repo");
    const config = loadConfig(
      {
        SHELBY_PROVIDER: "mock",
        ALLOW_DESTRUCTIVE_TOOLS: "false"
      },
      cwd
    );

    expect(config.shelbyWorkdir).toBe(path.win32.normalize("C:/workspace/repo/.shelby-workdir"));
    expect(config.shelbyStorageDir).toBe(
      path.win32.normalize("C:/workspace/repo/.shelby-workdir/.shelby-system/storage")
    );
    expect(config.tempDir).toBe(
      path.win32.normalize("C:/workspace/repo/.shelby-workdir/.shelby-system/tmp")
    );
  });

  test("rejects invalid boolean values", () => {
    expect(() =>
      loadConfig(
        {
          SHELBY_PROVIDER: "mock",
          ALLOW_DESTRUCTIVE_TOOLS: "sometimes"
        },
        process.cwd()
      )
    ).toThrow(ConfigValidationError);
  });

  test("rejects invalid provider values", () => {
    expect(() =>
      loadConfig(
        {
          SHELBY_PROVIDER: "invalid-provider",
          ALLOW_DESTRUCTIVE_TOOLS: "false"
        },
        process.cwd()
      )
    ).toThrow(ConfigValidationError);
  });

  test("rejects strict metadata mode without required keys", () => {
    expect(() =>
      loadConfig(
        {
          SHELBY_PROVIDER: "mock",
          SHELBY_STRICT_METADATA: "true",
          ALLOW_DESTRUCTIVE_TOOLS: "false"
        },
        process.cwd()
      )
    ).toThrow(ConfigValidationError);
  });

  test("treats blank optional env values as unset", () => {
    const config = loadConfig(
      {
        SHELBY_PROVIDER: "mock",
        SHELBY_API_URL: "   ",
        SHELBY_API_KEY: "",
        SHELBY_PRIVATE_KEY: "",
        SHELBY_DEFAULT_CONTENT_OWNER: "",
        SHELBY_DEFAULT_CLASSIFICATION: "",
        SHELBY_DEFAULT_SOURCE: "",
        TELEMETRY_ENDPOINT: "",
        TELEMETRY_ENVIRONMENT: "  ",
        ALLOW_DESTRUCTIVE_TOOLS: "false"
      },
      process.cwd()
    );

    expect(config.shelbyApiUrl).toBeUndefined();
    expect(config.shelbyApiKey).toBeUndefined();
    expect(config.shelbyPrivateKey).toBeUndefined();
    expect(config.defaultContentOwner).toBeUndefined();
    expect(config.defaultClassification).toBeUndefined();
    expect(config.defaultSource).toBeUndefined();
    expect(config.telemetryEndpoint).toBeUndefined();
    expect(config.telemetryEnvironment).toBe("development");
  });
});
