import { afterEach, describe, expect, test } from "vitest";
import {
  cleanupDirectory,
  createTempWorkspace,
  createTestConfig,
  createTestCoreServer
} from "../helpers.js";

describe("shelby_delete_blob", () => {
  const created: string[] = [];

  afterEach(async () => {
    await Promise.all(created.map((directory) => cleanupDirectory(directory)));
    created.length = 0;
  });

  test("returns a structured error when destructive tools are disabled", async () => {
    const workspace = await createTempWorkspace();
    created.push(workspace);
    const server = await createTestCoreServer(
      createTestConfig({
        shelbyWorkdir: `${workspace}/.shelby`,
        allowDestructiveTools: false
      })
    );

    const upload = await server.callTool("shelby_upload_text", {
      text: "delete me",
      targetName: "delete-me.txt"
    });

    expect(upload.ok).toBe(true);
    if (!upload.ok) {
      return;
    }

    const deletion = await server.callTool("shelby_delete_blob", {
      blobId: upload.data.id
    });

    expect(deletion.ok).toBe(false);
    if (!deletion.ok) {
      expect(deletion.error.code).toBe("TOOL_DISABLED");
    }
  });
});
