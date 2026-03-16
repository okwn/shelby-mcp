import type { AppConfig, AppLogger } from "../../../shared/src/index.js";
import type { ShelbyProvider } from "../types/index.js";
import { MockShelbyProvider } from "./mock-provider.js";
import { RealShelbyProvider } from "./real-provider.js";

export function createShelbyProvider(config: AppConfig, logger: AppLogger): ShelbyProvider {
  if (config.shelbyProvider === "real") {
    return new RealShelbyProvider(
      config,
      logger.child({ component: "real-provider" }, "real-provider")
    );
  }

  return new MockShelbyProvider(
    config,
    logger.child({ component: "mock-provider" }, "mock-provider")
  );
}
