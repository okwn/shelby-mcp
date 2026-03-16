import type { ShelbyCapabilities, ShelbyProvider } from "../types/index.js";

export class MediaService {
  constructor(private readonly provider: ShelbyProvider) {}

  async getSupportSummary(): Promise<{
    enabled: boolean;
    capabilities: Pick<ShelbyCapabilities, "supportsMedia">;
  }> {
    const capabilities = this.provider.capabilities();
    return {
      enabled: capabilities.supportsMedia,
      capabilities: {
        supportsMedia: capabilities.supportsMedia
      }
    };
  }
}
