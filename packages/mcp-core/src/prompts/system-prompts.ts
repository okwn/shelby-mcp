import { z } from "zod";

export type PromptDefinition = {
  name: string;
  title: string;
  description: string;
  argsSchema?: Record<string, z.ZodTypeAny>;
  render: (args?: Record<string, unknown>) => Promise<{
    description?: string;
    messages: Array<{
      role: "user";
      content: {
        type: "text";
        text: string;
      };
    }>;
  }>;
};

export function createSystemPrompts(): PromptDefinition[] {
  return [
    {
      name: "onboard-account",
      title: "Onboard Account",
      description:
        "Inspect provider state, capabilities, and sandbox status before doing Shelby work.",
      render: async () => ({
        description: "Use this prompt to safely onboard into the Shelby MCP environment.",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                "Start by calling shelby_healthcheck, shelby_capabilities, shelby_account_info, shelby_get_upload_policy, and shelby_get_safe_path_status.",
                "Summarize the active provider mode, account context, network, sandbox restrictions, streaming upload support, and whether strict metadata mode is active.",
                "If the real provider is degraded or write capability is unavailable, say so before attempting uploads."
              ].join("\n")
            }
          }
        ]
      })
    },
    {
      name: "prepare-batch-upload",
      title: "Prepare Batch Upload",
      description:
        "Inspect the current safe path, list candidate files, and propose a batch upload plan.",
      argsSchema: {
        directory: z.string().min(1).optional()
      },
      render: async (args) => ({
        description: "Use this prompt before batching files into Shelby.",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                "Confirm the current sandbox with shelby_get_safe_path_status.",
                "Check the upload policy with shelby_get_upload_policy and note any required metadata keys before proposing the plan.",
                `Inspect candidate files with shelby_list_local_upload_candidates using directory ${JSON.stringify(
                  args?.directory ?? "."
                )}.`,
                "Group the files into a sensible upload batch, gather metadata if strict mode requires it, explain the plan, then call shelby_batch_upload."
              ].join("\n")
            }
          }
        ]
      })
    },
    {
      name: "safe-upload-file",
      title: "Safe Upload File",
      description:
        "Verify sandbox scope, upload a file, inspect metadata, and optionally retrieve a blob URL.",
      argsSchema: {
        path: z.string().min(1),
        targetName: z.string().min(1).optional()
      },
      render: async (args) => ({
        description: "Use this prompt for a single-file Shelby upload.",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                "Confirm the sandbox scope with shelby_get_safe_path_status.",
                "Check shelby_get_upload_policy before uploading. If strict metadata mode is enabled, gather all required metadata keys first.",
                `Upload the file at ${JSON.stringify(args?.path)} with shelby_upload_file.`,
                `If provided, store it as ${JSON.stringify(args?.targetName ?? "the original file name")}.`,
                "After upload, call shelby_get_blob_metadata and shelby_get_blob_url so the result is easy to verify."
              ].join("\n")
            }
          }
        ]
      })
    },
    {
      name: "inspect-and-read-blob",
      title: "Inspect And Read Blob",
      description: "Inspect metadata first, then read blob text safely with truncation.",
      argsSchema: {
        blobId: z.string().min(1).optional(),
        blobKey: z.string().min(1).optional(),
        maxBytes: z.number().int().positive().optional()
      },
      render: async (args) => ({
        description: "Use this prompt for safe blob inspection and text readback.",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                `Inspect the blob first with shelby_get_blob_metadata using ${JSON.stringify(args ?? {})}.`,
                `If it looks text-safe, read it with shelby_read_blob_text using maxBytes ${JSON.stringify(
                  args?.maxBytes ?? "the default safe limit"
                )}.`,
                "Summarize whether the read was truncated and mention the blob size."
              ].join("\n")
            }
          }
        ]
      })
    },
    {
      name: "verify-local-against-blob",
      title: "Verify Local Against Blob",
      description:
        "Compare a local file to a Shelby blob using metadata and checksum verification.",
      argsSchema: {
        blobId: z.string().min(1).optional(),
        blobKey: z.string().min(1).optional(),
        localPath: z.string().min(1)
      },
      render: async (args) => ({
        description: "Use this prompt to validate a local file against a Shelby blob.",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                "Check blob metadata first with shelby_get_blob_metadata.",
                `Then verify it against the local file ${JSON.stringify(args?.localPath)} using shelby_verify_blob.`,
                "Report both local and remote checksums when they are available."
              ].join("\n")
            }
          }
        ]
      })
    }
  ];
}
