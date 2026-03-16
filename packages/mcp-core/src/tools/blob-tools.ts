import { z } from "zod";
import type { ShelbyService } from "../../../shelby-service/src/index.js";
import {
  batchUploadResultSchema,
  blobMetadataSchema,
  blobUrlResultSchema,
  createToolEnvelopeSchema,
  deleteBlobResultSchema,
  downloadResultSchema,
  executeTool,
  listBlobsResultSchema,
  listLocalUploadCandidatesResultSchema,
  metadataRecordSchema,
  readBlobTextResultSchema,
  type ToolDefinition,
  uploadResultSchema,
  verifyBlobResultSchema,
  withOptionalBlobIdentifier
} from "./common.js";

export function createBlobTools(service: ShelbyService): ToolDefinition[] {
  return [
    {
      name: "shelby_list_local_upload_candidates",
      description:
        "Inspect a local directory and list candidate files before a Shelby batch upload.",
      inputSchema: z.object({
        directory: z.string().min(1).default("."),
        recursive: z.boolean().optional(),
        maxEntries: z.number().int().positive().max(1000).optional()
      }),
      outputSchema: createToolEnvelopeSchema(listLocalUploadCandidatesResultSchema),
      annotations: {
        readOnlyHint: true
      },
      handler: (input) => executeTool(() => service.blob.listLocalUploadCandidates(input))
    },
    {
      name: "shelby_list_blobs",
      description: "List blobs for the current Shelby account or provider context.",
      inputSchema: z.object({
        prefix: z.string().min(1).optional(),
        limit: z.number().int().positive().max(100).optional(),
        cursor: z.string().min(1).optional()
      }),
      outputSchema: createToolEnvelopeSchema(listBlobsResultSchema),
      annotations: {
        readOnlyHint: true
      },
      handler: (input) => executeTool(() => service.blob.list(input))
    },
    {
      name: "shelby_get_blob_metadata",
      description: "Fetch metadata for a Shelby blob by id or key.",
      inputSchema: withOptionalBlobIdentifier({}),
      outputSchema: createToolEnvelopeSchema(blobMetadataSchema),
      annotations: {
        readOnlyHint: true
      },
      handler: (input) => executeTool(() => service.blob.getMetadata(input))
    },
    {
      name: "shelby_upload_file",
      description:
        "Upload a local filesystem file into Shelby storage using streaming reads where supported.",
      inputSchema: z.object({
        path: z.string().min(1),
        targetName: z.string().min(1).optional(),
        contentType: z.string().min(1).optional(),
        metadata: metadataRecordSchema.optional()
      }),
      outputSchema: createToolEnvelopeSchema(uploadResultSchema),
      annotations: {
        readOnlyHint: false
      },
      handler: (input) => executeTool(() => service.blob.uploadFile(input))
    },
    {
      name: "shelby_upload_text",
      description: "Upload inline text content as a Shelby blob.",
      inputSchema: z.object({
        text: z.string(),
        targetName: z.string().min(1),
        contentType: z.string().min(1).optional(),
        metadata: metadataRecordSchema.optional()
      }),
      outputSchema: createToolEnvelopeSchema(uploadResultSchema),
      annotations: {
        readOnlyHint: false
      },
      handler: (input) => executeTool(() => service.blob.uploadText(input))
    },
    {
      name: "shelby_download_blob",
      description:
        "Download a Shelby blob to a local output path or the configured temp directory.",
      inputSchema: withOptionalBlobIdentifier({
        outputPath: z.string().min(1).optional()
      }),
      outputSchema: createToolEnvelopeSchema(downloadResultSchema),
      annotations: {
        readOnlyHint: false
      },
      handler: (input) => executeTool(() => service.blob.downloadBlob(input))
    },
    {
      name: "shelby_read_blob_text",
      description: "Read a Shelby blob as text when the content type is text-safe.",
      inputSchema: withOptionalBlobIdentifier({
        maxBytes: z
          .number()
          .int()
          .positive()
          .max(1024 * 1024)
          .optional()
      }),
      outputSchema: createToolEnvelopeSchema(readBlobTextResultSchema),
      annotations: {
        readOnlyHint: true
      },
      handler: (input) => executeTool(() => service.blob.readBlobText(input))
    },
    {
      name: "shelby_get_blob_url",
      description: "Return a provider URL for retrieving a blob when the provider supports it.",
      inputSchema: withOptionalBlobIdentifier({}),
      outputSchema: createToolEnvelopeSchema(blobUrlResultSchema),
      annotations: {
        readOnlyHint: true
      },
      handler: (input) => executeTool(() => service.blob.getBlobUrl(input))
    },
    {
      name: "shelby_delete_blob",
      description: "Delete a Shelby blob when destructive tools are enabled.",
      inputSchema: withOptionalBlobIdentifier({}),
      outputSchema: createToolEnvelopeSchema(deleteBlobResultSchema),
      annotations: {
        destructiveHint: true,
        readOnlyHint: false
      },
      handler: (input) => executeTool(() => service.blob.deleteBlob(input))
    },
    {
      name: "shelby_batch_upload",
      description: "Upload multiple local files to Shelby in one operation.",
      inputSchema: z.object({
        paths: z.array(z.string().min(1)).min(1).max(100),
        prefix: z.string().min(1).optional(),
        continueOnError: z.boolean().optional(),
        metadata: metadataRecordSchema.optional()
      }),
      outputSchema: createToolEnvelopeSchema(batchUploadResultSchema),
      annotations: {
        readOnlyHint: false
      },
      handler: (input) => executeTool(() => service.blob.batchUpload(input))
    },
    {
      name: "shelby_verify_blob",
      description:
        "Verify remote blob integrity and optionally compare it with a local file checksum.",
      inputSchema: withOptionalBlobIdentifier({
        localPath: z.string().min(1).optional()
      }),
      outputSchema: createToolEnvelopeSchema(verifyBlobResultSchema),
      annotations: {
        readOnlyHint: true
      },
      handler: (input) => executeTool(() => service.blob.verifyBlob(input))
    },
    {
      name: "shelby_write_json",
      description: "Serialize JSON content and upload it as a Shelby blob.",
      inputSchema: z.object({
        data: z.unknown(),
        targetName: z.string().min(1),
        metadata: metadataRecordSchema.optional()
      }),
      outputSchema: createToolEnvelopeSchema(uploadResultSchema),
      annotations: {
        readOnlyHint: false
      },
      handler: (input) => executeTool(() => service.blob.writeJson(input))
    }
  ];
}
