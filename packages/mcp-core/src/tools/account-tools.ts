import type { ShelbyService } from "../../../shelby-service/src/index.js";
import {
  accountInfoSchema,
  capabilitiesSchema,
  createToolEnvelopeSchema,
  emptyInputSchema,
  executeTool,
  healthcheckResultSchema,
  type ToolDefinition,
  uploadPolicySchema
} from "./common.js";

export function createAccountTools(service: ShelbyService): ToolDefinition[] {
  return [
    {
      name: "shelby_healthcheck",
      description:
        "Perform a lightweight healthcheck and return safe configuration and provider readiness details.",
      inputSchema: emptyInputSchema,
      outputSchema: createToolEnvelopeSchema(healthcheckResultSchema),
      annotations: {
        readOnlyHint: true
      },
      handler: () => executeTool(() => service.account.healthcheck())
    },
    {
      name: "shelby_capabilities",
      description:
        "Return machine-readable provider capability flags for the active Shelby provider.",
      inputSchema: emptyInputSchema,
      outputSchema: createToolEnvelopeSchema(capabilitiesSchema),
      annotations: {
        readOnlyHint: true
      },
      handler: () => executeTool(async () => service.account.capabilities())
    },
    {
      name: "shelby_account_info",
      description:
        "Return active provider information, configured account context, and current capability status.",
      inputSchema: emptyInputSchema,
      outputSchema: createToolEnvelopeSchema(accountInfoSchema),
      annotations: {
        readOnlyHint: true
      },
      handler: () => executeTool(() => service.account.getInfo())
    },
    {
      name: "shelby_get_upload_policy",
      description:
        "Return the active Shelby upload policy, including strict metadata requirements and streaming support.",
      inputSchema: emptyInputSchema,
      outputSchema: createToolEnvelopeSchema(uploadPolicySchema),
      annotations: {
        readOnlyHint: true
      },
      handler: () => executeTool(async () => service.uploadPolicy.getPolicy())
    }
  ];
}
