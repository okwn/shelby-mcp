import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  cleanupDirectory,
  createTempWorkspace,
  createTestConfig,
  createTestCoreServer,
  writeFixtureFile
} from "../helpers.js";

describe("shelby_batch_upload", () => {
  const created: string[] = [];

  afterEach(async () => {
    await Promise.all(created.map((directory) => cleanupDirectory(directory)));
    created.length = 0;
  });

  test("uploads multiple files through the MCP tool layer", async () => {
    const workspace = await createTempWorkspace();
    created.push(workspace);
    const workdir = path.join(workspace, "workdir");

    const fileA = path.join(workdir, "input", "a.txt");
    const fileB = path.join(workdir, "input", "b.txt");
    await writeFixtureFile(fileA, "alpha");
    await writeFixtureFile(fileB, "beta");

    const server = await createTestCoreServer(
      createTestConfig({
        shelbyWorkdir: workdir,
        shelbyStorageDir: path.join(workdir, ".shelby-system", "storage"),
        tempDir: path.join(workdir, ".shelby-system", "tmp")
      })
    );

    const result = await server.callTool("shelby_batch_upload", {
      paths: ["input/a.txt", "input/b.txt"],
      prefix: "batch",
      continueOnError: false
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.successes).toHaveLength(2);
      expect(result.data.failures).toHaveLength(0);
      expect(result.data.successes[0]?.key.startsWith("batch/")).toBe(true);
    }
  });
});
