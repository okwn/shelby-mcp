import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { MockShelbyProvider } from "../../packages/shelby-service/src/index.js";
import { createLogger } from "../../packages/shared/src/index.js";
import {
  cleanupDirectory,
  createTempWorkspace,
  createTestConfig,
  writeFixtureFile
} from "../helpers.js";

describe("MockShelbyProvider", () => {
  const created: string[] = [];

  afterEach(async () => {
    await Promise.all(created.map((directory) => cleanupDirectory(directory)));
    created.length = 0;
  });

  test("uploads, lists, downloads, and verifies blobs", async () => {
    const workspace = await createTempWorkspace();
    created.push(workspace);
    const config = createTestConfig({
      shelbyWorkdir: path.join(workspace, ".shelby")
    });
    const provider = new MockShelbyProvider(config, createLogger({ logLevel: "silent" }));
    const sourceFile = path.join(workspace, "fixtures", "hello.txt");
    const downloadFile = path.join(workspace, "downloads", "hello.txt");

    await writeFixtureFile(sourceFile, "hello shelby");

    const upload = await provider.uploadFileStream({
      path: sourceFile,
      targetName: "docs/hello.txt",
      chunkSizeBytes: 64,
      sizeBytes: "hello shelby".length
    });
    expect(upload.key).toBe("docs/hello.txt");

    const list = await provider.listBlobs({ prefix: "docs/" });
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.id).toBe(upload.id);

    const download = await provider.downloadBlob({
      blobId: upload.id,
      outputPath: downloadFile
    });
    expect(download.savedPath).toBe(downloadFile);
    expect(await fs.readFile(downloadFile, "utf8")).toBe("hello shelby");

    const verify = await provider.verifyBlob({
      blobId: upload.id,
      localPath: sourceFile
    });
    expect(verify.verified).toBe(true);
    expect(verify.checksumLocal).toBe(upload.checksum?.value);
  });
});
