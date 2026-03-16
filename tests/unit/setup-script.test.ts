import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { formatSetupSummary, prepareLocalEnvironment } from "../../scripts/setup.js";
import { cleanupDirectory, createTempWorkspace } from "../helpers.js";

describe("setup bootstrap", () => {
  const created: string[] = [];

  afterEach(async () => {
    await Promise.all(created.map((directory) => cleanupDirectory(directory)));
    created.length = 0;
  });

  test("creates .env and required local directories when missing", async () => {
    const workspace = await createTempWorkspace("shelby-mcp-setup-");
    created.push(workspace);

    await fs.writeFile(
      path.join(workspace, ".env.example"),
      [
        "SHELBY_PROVIDER=mock",
        "SHELBY_WORKDIR=.shelby-workdir",
        "SHELBY_STORAGE_DIR=.shelby-system/storage",
        "TEMP_DIR=.shelby-system/tmp",
        "ALLOW_DESTRUCTIVE_TOOLS=false"
      ].join("\n"),
      "utf8"
    );

    const result = await prepareLocalEnvironment(workspace);

    expect(result.envCreated).toBe(true);
    await expect(fs.stat(path.join(workspace, ".env"))).resolves.toBeDefined();
    await expect(fs.stat(path.join(workspace, ".shelby-workdir"))).resolves.toBeDefined();
    await expect(
      fs.stat(path.join(workspace, ".shelby-workdir", ".shelby-system", "storage"))
    ).resolves.toBeDefined();
    await expect(
      fs.stat(path.join(workspace, ".shelby-workdir", ".shelby-system", "tmp"))
    ).resolves.toBeDefined();
  });

  test("does not overwrite an existing .env", async () => {
    const workspace = await createTempWorkspace("shelby-mcp-setup-");
    created.push(workspace);

    await fs.writeFile(
      path.join(workspace, ".env.example"),
      "SHELBY_PROVIDER=mock\nALLOW_DESTRUCTIVE_TOOLS=false\n",
      "utf8"
    );
    await fs.writeFile(
      path.join(workspace, ".env"),
      "SHELBY_PROVIDER=real\nALLOW_DESTRUCTIVE_TOOLS=true\n",
      "utf8"
    );

    const result = await prepareLocalEnvironment(workspace);
    const envContent = await fs.readFile(path.join(workspace, ".env"), "utf8");

    expect(result.envCreated).toBe(false);
    expect(envContent).toContain("SHELBY_PROVIDER=real");
    expect(envContent).toContain("ALLOW_DESTRUCTIVE_TOOLS=true");
  });

  test("summarizes setup and quick-start scripts clearly", async () => {
    const workspace = await createTempWorkspace("shelby-mcp-setup-");
    created.push(workspace);

    await fs.writeFile(
      path.join(workspace, ".env.example"),
      "SHELBY_PROVIDER=mock\nALLOW_DESTRUCTIVE_TOOLS=false\n",
      "utf8"
    );

    const result = await prepareLocalEnvironment(workspace);
    const summary = formatSetupSummary(result);

    expect(summary).toContain("npm.cmd run dev:mock");
    expect(summary).toContain("shelby://system/sandbox");
    expect(summary).toContain("shelby://system/upload-policy");
  });

  test("documents quick-start scripts in package metadata and README", async () => {
    const packageJson = JSON.parse(
      await fs.readFile(path.join(process.cwd(), "package.json"), "utf8")
    ) as {
      scripts: Record<string, string>;
    };
    const readme = await fs.readFile(path.join(process.cwd(), "README.md"), "utf8");

    expect(packageJson.scripts.setup).toBeDefined();
    expect(packageJson.scripts["dev:mock"]).toBeDefined();
    expect(readme).toContain("npm.cmd run setup");
    expect(readme).toContain("npm.cmd run dev:mock");
  });
});
