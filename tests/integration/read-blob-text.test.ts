import { afterEach, describe, expect, test } from "vitest";
import {
  cleanupDirectory,
  createTempWorkspace,
  createTestConfig,
  createTestCoreServer
} from "../helpers.js";

describe("shelby_read_blob_text", () => {
  const created: string[] = [];

  afterEach(async () => {
    await Promise.all(created.map((directory) => cleanupDirectory(directory)));
    created.length = 0;
  });

  test("truncates text reads when maxBytes is smaller than the blob size", async () => {
    const workspace = await createTempWorkspace();
    created.push(workspace);
    const server = await createTestCoreServer(
      createTestConfig({
        shelbyWorkdir: `${workspace}/.shelby`
      })
    );

    const upload = await server.callTool("shelby_upload_text", {
      text: "abcdefghij",
      targetName: "letters.txt"
    });

    expect(upload.ok).toBe(true);
    if (!upload.ok) {
      return;
    }

    const result = await server.callTool("shelby_read_blob_text", {
      blobId: upload.data.id,
      maxBytes: 5
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.truncated).toBe(true);
      expect(result.data.text).toBe("abcde");
      expect(result.data.bytesRead).toBe(5);
    }
  });
});
