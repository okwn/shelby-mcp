import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  cleanupDirectory,
  createTempWorkspace,
  createTestConfig,
  createTestCoreServer,
  writeFixtureFile
} from "../helpers.js";

describe("strict metadata mode", () => {
  const created: string[] = [];

  afterEach(async () => {
    await Promise.all(created.map((directory) => cleanupDirectory(directory)));
    created.length = 0;
  });

  test("allows uploads without metadata when strict mode is disabled", async () => {
    const workspace = await createTempWorkspace();
    created.push(workspace);

    const server = await createTestCoreServer(
      createTestConfig({
        shelbyWorkdir: path.join(workspace, "workdir")
      })
    );

    const result = await server.callTool("shelby_upload_text", {
      text: "hello",
      targetName: "hello.txt"
    });

    expect(result.ok).toBe(true);
  });

  test("rejects uploads without metadata when strict mode is enabled", async () => {
    const workspace = await createTempWorkspace();
    created.push(workspace);

    const server = await createTestCoreServer(
      createTestConfig({
        shelbyWorkdir: path.join(workspace, "workdir"),
        strictMetadata: true,
        requiredMetadataKeys: ["classification", "source"]
      })
    );

    const result = await server.callTool("shelby_upload_text", {
      text: "hello",
      targetName: "hello.txt"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("STRICT_METADATA_REQUIRED");
    }
  });

  test("accepts valid metadata when strict mode is enabled", async () => {
    const workspace = await createTempWorkspace();
    created.push(workspace);

    const server = await createTestCoreServer(
      createTestConfig({
        shelbyWorkdir: path.join(workspace, "workdir"),
        strictMetadata: true,
        requiredMetadataKeys: ["classification", "source"]
      })
    );

    const result = await server.callTool("shelby_write_json", {
      data: { hello: "world" },
      targetName: "hello.json",
      metadata: {
        classification: "internal",
        source: "test-suite"
      }
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.metadata).toMatchObject({
        classification: "internal",
        source: "test-suite"
      });
    }
  });

  test("enforces metadata policy on batch upload", async () => {
    const workspace = await createTempWorkspace();
    created.push(workspace);
    const workdir = path.join(workspace, "workdir");

    await writeFixtureFile(path.join(workdir, "input", "a.txt"), "alpha");
    await writeFixtureFile(path.join(workdir, "input", "b.txt"), "beta");

    const server = await createTestCoreServer(
      createTestConfig({
        shelbyWorkdir: workdir,
        shelbyStorageDir: path.join(workdir, ".shelby-system", "storage"),
        tempDir: path.join(workdir, ".shelby-system", "tmp"),
        strictMetadata: true,
        requiredMetadataKeys: ["classification", "source"]
      })
    );

    const rejected = await server.callTool("shelby_batch_upload", {
      paths: ["input/a.txt", "input/b.txt"]
    });
    expect(rejected.ok).toBe(false);

    const accepted = await server.callTool("shelby_batch_upload", {
      paths: ["input/a.txt", "input/b.txt"],
      metadata: {
        classification: "internal",
        source: "batch-test"
      }
    });
    expect(accepted.ok).toBe(true);
  });
});
