import type { AppConfig, AppLogger } from "../../../shared/src/index.js";
import { AppError } from "../errors/index.js";
import type { ShelbyProvider, UploadMetadata, UploadPolicy } from "../types/index.js";

function normalizeMetadata(metadata: UploadMetadata | undefined): UploadMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  const normalized = Object.fromEntries(
    Object.entries(metadata)
      .map(([key, value]) => [key.trim(), value.trim()] as const)
      .filter(([key, value]) => key.length > 0 && value.length > 0)
  );

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export class UploadPolicyService {
  constructor(
    private readonly config: AppConfig,
    private readonly provider: ShelbyProvider,
    private readonly logger: AppLogger
  ) {}

  getPolicy(): UploadPolicy {
    const capabilities = this.provider.capabilities();
    return {
      strictMetadata: this.config.strictMetadata,
      requiredMetadataKeys: [...this.config.requiredMetadataKeys],
      defaultMetadataKeys: Object.keys(this.getDefaultMetadata()),
      maxUploadSizeMb: this.config.maxUploadSizeMb,
      maxUploadSizeBytes: this.config.maxUploadSizeBytes,
      streamUploadChunkSizeBytes: this.config.streamUploadChunkSizeBytes,
      supportsStreamingUpload: capabilities.supportsStreamingUpload,
      supportsStrictMetadataValidation: capabilities.supportsStrictMetadataValidation,
      destructiveToolsEnabled: this.config.allowDestructiveTools
    };
  }

  resolveMetadata(
    metadata: UploadMetadata | undefined,
    context: { operation: string }
  ): UploadMetadata | undefined {
    const normalized = normalizeMetadata(metadata);

    if (this.config.strictMetadata) {
      const missingKeys = this.config.requiredMetadataKeys.filter((key) => !normalized?.[key]);

      if (missingKeys.length > 0) {
        this.logger.warn(
          {
            operation: context.operation,
            missingKeys,
            requiredMetadataKeys: this.config.requiredMetadataKeys
          },
          "Upload rejected by strict metadata policy.",
          { notifyClient: true }
        );
        throw new AppError(
          "STRICT_METADATA_REQUIRED",
          "Upload metadata is required by the active Shelby strict metadata policy.",
          {
            operation: context.operation,
            requiredMetadataKeys: this.config.requiredMetadataKeys,
            missingKeys
          }
        );
      }

      return normalized;
    }

    const merged = {
      ...this.getDefaultMetadata(),
      ...(normalized ?? {})
    };

    return Object.keys(merged).length > 0 ? merged : undefined;
  }

  private getDefaultMetadata(): UploadMetadata {
    const defaults: UploadMetadata = {};

    if (this.config.defaultContentOwner) {
      defaults.contentOwner = this.config.defaultContentOwner;
    }
    if (this.config.defaultClassification) {
      defaults.classification = this.config.defaultClassification;
    }
    if (this.config.defaultSource) {
      defaults.source = this.config.defaultSource;
    }

    return defaults;
  }
}
