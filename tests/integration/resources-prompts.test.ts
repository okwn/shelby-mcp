import { afterEach, describe, expect, test } from "vitest";
import {
  cleanupDirectory,
  createTempWorkspace,
  createTestConfig,
  createTestCoreServer
} from "../helpers.js";

describe("resources and prompts", () => {
  const created: string[] = [];

  afterEach(async () => {
    await Promise.all(created.map((directory) => cleanupDirectory(directory)));
    created.length = 0;
  });

  test("exposes dynamic system resources", async () => {
    const workspace = await createTempWorkspace();
    created.push(workspace);

    const server = await createTestCoreServer(
      createTestConfig({
        shelbyWorkdir: `${workspace}/.shelby`
      })
    );

    const resources = server.listResources();
    expect(resources.map((resource) => resource.uri)).toEqual(
      expect.arrayContaining([
        "shelby://system/capabilities",
        "shelby://system/account",
        "shelby://system/upload-policy",
        "shelby://system/sandbox",
        "shelby://system/tools",
        "shelby://system/workflows"
      ])
    );

    const sandbox = await server.readResource("shelby://system/sandbox");
    expect(sandbox).toHaveProperty("sandbox.rootPath");

    const capabilities = await server.readResource("shelby://system/capabilities");
    expect(capabilities).toHaveProperty("telemetry.enabled", false);
    expect(capabilities).toHaveProperty("uploadPolicy.supportsStreamingUpload");
  });

  test("registers meaningful workflow prompts", async () => {
    const workspace = await createTempWorkspace();
    created.push(workspace);

    const server = await createTestCoreServer(
      createTestConfig({
        shelbyWorkdir: `${workspace}/.shelby`
      })
    );

    const promptNames = server.listPrompts().map((prompt) => prompt.name);
    expect(promptNames).toEqual(
      expect.arrayContaining([
        "onboard-account",
        "prepare-batch-upload",
        "safe-upload-file",
        "inspect-and-read-blob",
        "verify-local-against-blob"
      ])
    );

    const rendered = await server.renderPrompt("safe-upload-file", {
      path: "./docs/readme.md"
    });
    expect(rendered.messages[0]?.content.text).toContain("shelby_upload_file");
    expect(rendered.messages[0]?.content.text).toContain("shelby_get_upload_policy");
  });
});
