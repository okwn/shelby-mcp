import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { SandboxService } from "../../packages/shelby-service/src/index.js";
import { createLogger } from "../../packages/shared/src/index.js";
import {
  cleanupDirectory,
  createTempWorkspace,
  createTestConfig,
  writeFixtureFile
} from "../helpers.js";

describe("SandboxService", () => {
  const created: string[] = [];

  afterEach(async () => {
    await Promise.all(created.map((directory) => cleanupDirectory(directory)));
    created.length = 0;
  });

  test("rejects traversal outside the active scope and allows narrowing only", async () => {
    const workspace = await createTempWorkspace();
    created.push(workspace);

    const root = path.join(workspace, "workdir");
    const docsDir = path.join(root, "docs");
    const nestedDir = path.join(docsDir, "nested");
    await fs.mkdir(nestedDir, { recursive: true });
    await writeFixtureFile(path.join(nestedDir, "note.txt"), "sandbox");

    const sandbox = new SandboxService(
      createTestConfig({
        shelbyWorkdir: root,
        shelbyStorageDir: path.join(root, ".shelby-system", "storage"),
        tempDir: path.join(root, ".shelby-system", "tmp")
      }),
      createLogger({ logLevel: "silent" })
    );

    await sandbox.initialize();
    const narrowed = await sandbox.setSafePath("docs");
    expect(narrowed.effectiveScope).toBe("docs");

    await expect(sandbox.resolveInputFile("../outside.txt")).rejects.toThrow(
      /safe scope|configured Shelby workdir/i
    );

    const nested = await sandbox.setSafePath("nested");
    expect(nested.effectiveScope).toBe("docs/nested");

    await expect(sandbox.setSafePath(path.join(root, "docs"))).rejects.toThrow(/safe scope/i);
  });

  test("blocks reserved internal directories from agent access", async () => {
    const workspace = await createTempWorkspace();
    created.push(workspace);

    const root = path.join(workspace, "workdir");
    const config = createTestConfig({
      shelbyWorkdir: root,
      shelbyStorageDir: path.join(root, ".shelby-system", "storage"),
      tempDir: path.join(root, ".shelby-system", "tmp")
    });
    const sandbox = new SandboxService(config, createLogger({ logLevel: "silent" }));
    await sandbox.initialize();

    await expect(sandbox.resolveInputDirectory(".shelby-system")).rejects.toThrow(
      /internal Shelby directory/i
    );
  });
});
