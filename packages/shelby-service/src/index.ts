import type { AppConfig, AppLogger, TelemetryClient } from "../../shared/src/index.js";
import { AccountService } from "./account/index.js";
import { BlobService, UploadPolicyService } from "./blob/index.js";
import { MediaService } from "./media/index.js";
import { SandboxService } from "./sandbox/index.js";
import type { ShelbyProvider } from "./types/index.js";

export class ShelbyService {
  readonly account: AccountService;
  readonly blob: BlobService;
  readonly media: MediaService;
  readonly sandbox: SandboxService;
  readonly uploadPolicy: UploadPolicyService;

  constructor(
    readonly provider: ShelbyProvider,
    readonly config: AppConfig,
    readonly logger: AppLogger,
    readonly telemetry: TelemetryClient
  ) {
    this.sandbox = new SandboxService(config, logger.child({ component: "sandbox" }, "sandbox"));
    this.uploadPolicy = new UploadPolicyService(
      config,
      provider,
      logger.child({ component: "upload-policy" }, "upload-policy")
    );
    this.account = new AccountService(provider, this.uploadPolicy, telemetry);
    this.blob = new BlobService(
      provider,
      config,
      this.sandbox,
      logger.child({ component: "blob-service" }, "blob-service"),
      this.uploadPolicy
    );
    this.media = new MediaService(provider);
  }

  async initialize() {
    await this.sandbox.initialize();
  }
}

export * from "./account/index.js";
export * from "./blob/index.js";
export * from "./errors/index.js";
export * from "./media/index.js";
export * from "./provider/index.js";
export * from "./sandbox/index.js";
export * from "./types/index.js";
