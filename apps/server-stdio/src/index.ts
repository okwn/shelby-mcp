import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createShelbyMcpCoreServer } from "../../../packages/mcp-core/src/index.js";
import { createShelbyProvider, ShelbyService } from "../../../packages/shelby-service/src/index.js";
import {
  createLogger,
  createTelemetryClient,
  loadConfig
} from "../../../packages/shared/src/index.js";

const SERVER_NAME = "shelby-mcp";
const SERVER_VERSION = "0.1.0";

async function main() {
  const config = loadConfig();
  const logger = createLogger(config);
  const telemetry = createTelemetryClient(config, logger, {
    name: SERVER_NAME,
    version: SERVER_VERSION
  });
  const provider = createShelbyProvider(config, logger);
  const service = new ShelbyService(provider, config, logger, telemetry);
  await service.initialize();
  const server = createShelbyMcpCoreServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
    service,
    logger
  });

  process.on("uncaughtException", (error) => {
    logger.error({ err: error }, "uncaught exception");
    process.exitCode = 1;
  });

  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "unhandled rejection");
    process.exitCode = 1;
  });

  await server.connect(new StdioServerTransport());

  const healthcheck = await service.account.healthcheck();
  const telemetryStatus = telemetry.getStatus();
  if (telemetryStatus.requested && !telemetryStatus.enabled && telemetryStatus.reason) {
    logger.warn(
      {
        telemetry: telemetryStatus
      },
      telemetryStatus.reason
    );
  }
  if (healthcheck.warnings.length > 0) {
    for (const warning of healthcheck.warnings) {
      logger.warn({ provider: config.shelbyProvider }, warning, {
        notifyClient: true
      });
    }
  }

  await telemetry.captureStartupSnapshot({
    providerMode: config.shelbyProvider,
    supportsStreamingUpload: provider.capabilities().supportsStreamingUpload,
    supportsBatch: provider.capabilities().supportsBatch,
    supportsVerification: provider.capabilities().supportsVerification,
    strictMetadata: config.strictMetadata,
    requiredMetadataKeyCount: config.requiredMetadataKeys.length,
    destructiveToolsEnabled: config.allowDestructiveTools
  });

  logger.info({ provider: config.shelbyProvider }, "Shelby MCP STDIO server is ready.", {
    notifyClient: true
  });
}

main().catch((error) => {
  const fallbackLogger = createLogger({
    logLevel: "error"
  });
  fallbackLogger.error({ err: error }, "failed to start Shelby MCP server");
  process.exit(1);
});
