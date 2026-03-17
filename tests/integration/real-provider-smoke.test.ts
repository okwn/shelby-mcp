import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  createShelbyProvider,
  RealShelbyProvider
} from "../../packages/shelby-service/src/index.js";
import { createLogger, loadConfig } from "../../packages/shared/src/index.js";
import { cleanupDirectory, createTempWorkspace, createTestConfig } from "../helpers.js";

const liveSmokeRequested = process.env.SHELBY_REAL_SMOKE === "true";

describe("RealShelbyProvider smoke", () => {
  const created: string[] = [];

  afterEach(async () => {
    await Promise.all(created.map((directory) => cleanupDirectory(directory)));
    created.length = 0;
  });

  test("initializes the real provider path and reports degraded health without live config", async () => {
    const workspace = await createTempWorkspace();
    created.push(workspace);

    const workdir = path.join(workspace, "workdir");
    const config = createTestConfig({
      shelbyProvider: "real",
      shelbyWorkdir: workdir,
      shelbyStorageDir: path.join(workdir, ".shelby-system", "storage"),
      tempDir: path.join(workdir, ".shelby-system", "tmp")
    });

    const provider = createShelbyProvider(config, createLogger({ logLevel: "silent" }));

    expect(provider).toBeInstanceOf(RealShelbyProvider);
    expect(provider.capabilities()).toMatchObject({
      mode: "real",
      supportsStreamingUpload: false,
      supportsDelete: false,
      supportsStrictMetadataValidation: true
    });

    const accountInfo = await provider.getAccountInfo();
    expect(accountInfo.mode).toBe("real");
    expect(accountInfo.status).toBe("degraded");
    expect(accountInfo.notes).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/SHELBY_NETWORK/),
        expect.stringMatching(/SHELBY_ACCOUNT_ID/)
      ])
    );

    const healthcheck = await provider.healthcheck();
    expect(healthcheck.ok).toBe(false);
    expect(healthcheck.provider).toBe("real-shelby");
    expect(healthcheck.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/SHELBY_NETWORK/),
        expect.stringMatching(/SHELBY_ACCOUNT_ID/)
      ])
    );
  });

  test("reports ready read capabilities when network and account config are present", async () => {
    const workspace = await createTempWorkspace();
    created.push(workspace);

    const workdir = path.join(workspace, "workdir");
    const config = createTestConfig({
      shelbyProvider: "real",
      shelbyWorkdir: workdir,
      shelbyStorageDir: path.join(workdir, ".shelby-system", "storage"),
      tempDir: path.join(workdir, ".shelby-system", "tmp"),
      shelbyNetwork: "testnet",
      shelbyAccountId: "0x1"
    });

    const provider = createShelbyProvider(config, createLogger({ logLevel: "silent" }));
    const accountInfo = await provider.getAccountInfo();

    expect(accountInfo.status).toBe("ready");
    expect(accountInfo.capabilities).toMatchObject({
      mode: "real",
      supportsMetadata: true,
      supportsPagination: true,
      supportsDelete: false
    });
    expect(accountInfo.network?.explorerUrl).toContain("0x1");
  });

  test.runIf(liveSmokeRequested)(
    "optionally performs a live real-provider healthcheck and list probe",
    async () => {
      expect(process.env.SHELBY_NETWORK).toBeTruthy();
      expect(process.env.SHELBY_ACCOUNT_ID).toBeTruthy();

      const workspace = await createTempWorkspace("shelby-mcp-real-smoke-");
      created.push(workspace);

      const workdir = path.join(workspace, "workdir");
      const config = loadConfig(
        {
          ...process.env,
          SHELBY_PROVIDER: "real",
          SHELBY_WORKDIR: workdir,
          SHELBY_STORAGE_DIR: ".shelby-system/storage",
          TEMP_DIR: ".shelby-system/tmp",
          ALLOW_DESTRUCTIVE_TOOLS: "false"
        },
        process.cwd()
      );

      const provider = createShelbyProvider(config, createLogger({ logLevel: "info" }));
      const accountInfo = await provider.getAccountInfo();
      expect(accountInfo.mode).toBe("real");
      expect(accountInfo.accountId).toBe(config.shelbyAccountId);

      const healthcheck = await provider.healthcheck();
      expect(healthcheck.provider).toBe("real-shelby");
      expect(healthcheck.ok).toBe(true);

      const list = await provider.listBlobs({ limit: 1 });
      expect(Array.isArray(list.items)).toBe(true);
    }
  );
});
