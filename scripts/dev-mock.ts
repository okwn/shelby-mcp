import path from "node:path";
import { prepareLocalEnvironment } from "./setup.js";

async function main(): Promise<void> {
  process.env.SHELBY_PROVIDER = "mock";
  process.env.SHELBY_WORKDIR ??= ".shelby-workdir";
  process.env.SHELBY_STORAGE_DIR ??= ".shelby-system/storage";
  process.env.TEMP_DIR ??= ".shelby-system/tmp";

  await prepareLocalEnvironment(process.cwd(), process.env);

  process.stderr.write(
    `Starting Shelby MCP mock server with workdir ${path.resolve(process.cwd(), process.env.SHELBY_WORKDIR)}\n`
  );

  await import("../apps/server-stdio/src/index.js");
}

void main().catch((error: unknown) => {
  process.stderr.write(`dev:mock failed: ${(error as Error).message}\n`);
  process.exit(1);
});
