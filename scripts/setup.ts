import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseDotEnv } from "dotenv";
import { type AppConfig, ensureDir, loadConfig } from "../packages/shared/src/index.js";

export type SetupResult = {
  config: AppConfig;
  envPath: string;
  envExamplePath: string;
  envCreated: boolean;
  createdDirectories: string[];
};

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureEnvFile(rootDir: string): Promise<{
  envPath: string;
  envExamplePath: string;
  envCreated: boolean;
}> {
  const envPath = path.join(rootDir, ".env");
  const envExamplePath = path.join(rootDir, ".env.example");

  if (await pathExists(envPath)) {
    return {
      envPath,
      envExamplePath,
      envCreated: false
    };
  }

  const exampleExists = await pathExists(envExamplePath);
  if (!exampleExists) {
    throw new Error(`Missing .env.example at ${envExamplePath}`);
  }

  await fs.copyFile(envExamplePath, envPath);
  return {
    envPath,
    envExamplePath,
    envCreated: true
  };
}

async function loadBootstrapConfig(
  rootDir: string,
  envPath: string,
  overrides: NodeJS.ProcessEnv = {}
): Promise<AppConfig> {
  const fileContent = await fs.readFile(envPath, "utf8");
  const fileEnv = parseDotEnv(fileContent);
  return loadConfig(
    {
      ...fileEnv,
      ...overrides
    },
    rootDir
  );
}

export async function prepareLocalEnvironment(
  rootDir = process.cwd(),
  overrides: NodeJS.ProcessEnv = {}
): Promise<SetupResult> {
  const envResult = await ensureEnvFile(rootDir);
  const config = await loadBootstrapConfig(rootDir, envResult.envPath, overrides);

  const directories = [config.shelbyWorkdir, config.shelbyStorageDir, config.tempDir];

  await Promise.all(directories.map((directory) => ensureDir(directory)));

  return {
    config,
    envPath: envResult.envPath,
    envExamplePath: envResult.envExamplePath,
    envCreated: envResult.envCreated,
    createdDirectories: directories
  };
}

export function formatSetupSummary(result: SetupResult): string {
  const envStatus = result.envCreated
    ? `Created ${path.basename(result.envPath)} from .env.example.`
    : `Kept existing ${path.basename(result.envPath)}.`;

  return [
    "Shelby MCP local environment is ready.",
    envStatus,
    `Workdir: ${result.config.shelbyWorkdir}`,
    `Storage: ${result.config.shelbyStorageDir}`,
    `Temp: ${result.config.tempDir}`,
    "",
    "Next steps:",
    "1. npm.cmd run dev:mock",
    "2. Connect your MCP client to the running STDIO server",
    "3. Inspect shelby://system/sandbox and shelby://system/upload-policy"
  ].join("\n");
}

export async function runSetup(rootDir = process.cwd()): Promise<void> {
  const result = await prepareLocalEnvironment(rootDir);
  process.stdout.write(`${formatSetupSummary(result)}\n`);
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) {
  void runSetup().catch((error: unknown) => {
    process.stderr.write(`Setup failed: ${(error as Error).message}\n`);
    process.exit(1);
  });
}
