import type { ToolRegistry } from "../tool-registry.js";
import type { ShelbyService } from "../../../shelby-service/src/index.js";

export type ResourceDefinition = {
  name: string;
  uri: string;
  title: string;
  description: string;
  mimeType: string;
  read: () => Promise<Record<string, unknown>>;
};

export function createSystemResources(
  service: ShelbyService,
  registry: ToolRegistry
): ResourceDefinition[] {
  return [
    {
      name: "shelby_system_capabilities",
      uri: "shelby://system/capabilities",
      title: "Shelby Capabilities",
      description: "Provider capabilities, mode, and safety settings.",
      mimeType: "application/json",
      read: async () => ({
        provider: await service.account.getInfo(),
        capabilities: await service.account.capabilities(),
        telemetry: service.telemetry.getStatus(),
        uploadPolicy: service.uploadPolicy.getPolicy(),
        transport: "stdio",
        destructiveToolsEnabled: service.config.allowDestructiveTools
      })
    },
    {
      name: "shelby_system_account",
      uri: "shelby://system/account",
      title: "Shelby Account",
      description: "Active provider status, account context, and network information.",
      mimeType: "application/json",
      read: async () => ({
        account: await service.account.getInfo(),
        healthcheck: await service.account.healthcheck()
      })
    },
    {
      name: "shelby_system_upload_policy",
      uri: "shelby://system/upload-policy",
      title: "Shelby Upload Policy",
      description: "Upload policy, strict metadata requirements, and streaming settings.",
      mimeType: "application/json",
      read: async () => ({
        uploadPolicy: service.uploadPolicy.getPolicy(),
        telemetry: service.telemetry.getStatus()
      })
    },
    {
      name: "shelby_system_sandbox",
      uri: "shelby://system/sandbox",
      title: "Shelby Sandbox",
      description: "Current filesystem sandbox root, active safe scope, and restrictions.",
      mimeType: "application/json",
      read: async () => ({
        sandbox: service.sandbox.getStatus()
      })
    },
    {
      name: "shelby_system_tools",
      uri: "shelby://system/tools",
      title: "Shelby Tool Catalog",
      description: "Catalog of MCP tools exposed by this server.",
      mimeType: "application/json",
      read: async () => ({
        tools: registry.list().map((tool) => ({
          name: tool.name,
          description: tool.description
        }))
      })
    },
    {
      name: "shelby_system_workflows",
      uri: "shelby://system/workflows",
      title: "Shelby Workflow Guide",
      description: "Recommended tool sequences for common Shelby operations.",
      mimeType: "application/json",
      read: async () => ({
        workflows: {
          accountInspection: [
            "shelby_healthcheck",
            "shelby_capabilities",
            "shelby_account_info",
            "shelby_get_upload_policy",
            "shelby_get_safe_path_status"
          ],
          safeUpload: [
            "shelby_get_safe_path_status",
            "shelby_get_upload_policy",
            "shelby_list_local_upload_candidates",
            "shelby_upload_file",
            "shelby_get_blob_metadata",
            "shelby_get_blob_url"
          ],
          batchUpload: [
            "shelby_get_safe_path_status",
            "shelby_get_upload_policy",
            "shelby_list_local_upload_candidates",
            "shelby_batch_upload"
          ],
          textReadback: ["shelby_get_blob_metadata", "shelby_read_blob_text"],
          verification: ["shelby_get_blob_metadata", "shelby_verify_blob"]
        }
      })
    }
  ];
}
