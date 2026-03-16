import type { TelemetryClient } from "../../../shared/src/index.js";
import type { UploadPolicyService } from "../blob/index.js";
import type { HealthcheckResult, ShelbyProvider } from "../types/index.js";

export class AccountService {
  constructor(
    private readonly provider: ShelbyProvider,
    private readonly uploadPolicy: UploadPolicyService,
    private readonly telemetry: TelemetryClient
  ) {}

  async getInfo() {
    return this.provider.getAccountInfo();
  }

  async capabilities() {
    return this.provider.capabilities();
  }

  async healthcheck() {
    const providerHealthcheck = await this.provider.healthcheck();
    const telemetryStatus = this.telemetry.getStatus();
    const warnings = [...providerHealthcheck.warnings];

    if (telemetryStatus.requested && !telemetryStatus.enabled && telemetryStatus.reason) {
      warnings.push(telemetryStatus.reason);
    }

    const healthcheck: HealthcheckResult = {
      ...providerHealthcheck,
      ok: providerHealthcheck.ok && warnings.length === 0,
      warnings,
      uploadPolicy: this.uploadPolicy.getPolicy(),
      telemetry: telemetryStatus
    };

    return healthcheck;
  }
}
