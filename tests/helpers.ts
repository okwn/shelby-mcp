import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createShelbyMcpCoreServer } from "../packages/mcp-core/src/index.js";
import {
  createShelbyProvider,
  type ShelbyProvider,
  ShelbyService
} from "../packages/shelby-service/src/index.js";
import {
  type AppConfig,
  createLogger,
  NoopTelemetryClient,
  type TelemetryClient
} from "../packages/shared/src/index.js";

export async function createTempWorkspace(prefix = "shelby-mcp-test-") {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export function createTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const shelbyWorkdir = overrides.shelbyWorkdir ?? path.join(process.cwd(), ".tmp-shelby-tests");

  return {
    nodeEnv: "test",
    logLevel: "silent",
    shelbyProvider: "mock",
    shelbyWorkdir,
    shelbyStorageDir: path.join(shelbyWorkdir, ".shelby-system", "storage"),
    tempDir: path.join(shelbyWorkdir, ".shelby-system", "tmp"),
    maxUploadSizeMb: 50,
    maxUploadSizeBytes: 50 * 1024 * 1024,
    maxReadTextBytes: 64 * 1024,
    streamUploadChunkSizeBytes: 256 * 1024,
    strictMetadata: false,
    requiredMetadataKeys: [],
    telemetryEnabled: false,
    telemetryEnvironment: "test",
    telemetrySampleRate: 1,
    allowDestructiveTools: false,
    ...overrides
  };
}

export function createTestProvider(
  config: AppConfig,
  logger = createLogger({ logLevel: config.logLevel })
): ShelbyProvider {
  return createShelbyProvider(config, logger);
}

function createNoopTelemetry(): TelemetryClient {
  return new NoopTelemetryClient({
    requested: false,
    enabled: false,
    endpointConfigured: false,
    environment: "test",
    sampleRate: 1,
    transport: "noop"
  });
}

export async function createTestService(
  config: AppConfig,
  options: {
    telemetry?: TelemetryClient;
  } = {}
) {
  const logger = createLogger({ logLevel: config.logLevel });
  const service = new ShelbyService(
    createTestProvider(config, logger),
    config,
    logger,
    options.telemetry ?? createNoopTelemetry()
  );
  await service.initialize();
  return service;
}

export async function createTestCoreServer(
  config: AppConfig,
  options: {
    telemetry?: TelemetryClient;
  } = {}
) {
  const logger = createLogger({ logLevel: config.logLevel });
  const service = new ShelbyService(
    createShelbyProvider(config, logger),
    config,
    logger,
    options.telemetry ?? createNoopTelemetry()
  );
  await service.initialize();

  return createShelbyMcpCoreServer({
    name: "shelby-mcp-test",
    version: "0.1.0-test",
    service,
    logger
  });
}

export async function writeFixtureFile(filePath: string, content: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

export async function cleanupDirectory(directory: string) {
  await fs.rm(directory, { recursive: true, force: true });
}
