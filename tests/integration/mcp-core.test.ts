import { afterEach, describe, expect, test } from "vitest";
import {
  cleanupDirectory,
  createTempWorkspace,
  createTestConfig,
  createTestCoreServer
} from "../helpers.js";

describe("ShelbyMcpCoreServer", () => {
  const created: string[] = [];

  afterEach(async () => {
    await Promise.all(created.map((directory) => cleanupDirectory(directory)));
    created.length = 0;
  });

  test("registers tools and handles direct tool calls", async () => {
    const workspace = await createTempWorkspace();
    created.push(workspace);
    const server = await createTestCoreServer(
      createTestConfig({
        shelbyWorkdir: `${workspace}/.shelby`
      })
    );

    const toolNames = server.listTools().map((tool) => tool.name);
    expect(toolNames.length).toBeGreaterThanOrEqual(18);
    expect(toolNames).toContain("shelby_account_info");
    expect(toolNames).toContain("shelby_upload_text");
    expect(toolNames).toContain("shelby_get_safe_path_status");
    expect(toolNames).toContain("shelby_get_upload_policy");

    const result = await server.callTool("shelby_account_info", {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.mode).toBe("mock");
    }
    const sandboxStatus = await server.callTool("shelby_get_safe_path_status", {});
    expect(sandboxStatus.ok).toBe(true);

    const uploadPolicy = await server.callTool("shelby_get_upload_policy", {});
    expect(uploadPolicy.ok).toBe(true);
  });
});
