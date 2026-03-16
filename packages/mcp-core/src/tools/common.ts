import { z } from "zod";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { metadataRecordSchema } from "../../../shared/src/index.js";
import { toSerializableError } from "../../../shelby-service/src/errors/index.js";
import type { ToolEnvelope } from "../../../shelby-service/src/types/index.js";

export { metadataRecordSchema };

export const serializableErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional()
});

export function createToolEnvelopeSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.union([
    z.object({
      ok: z.literal(true),
      data: dataSchema
    }),
    z.object({
      ok: z.literal(false),
      error: serializableErrorSchema
    })
  ]);
}

export function success<T>(data: T): ToolEnvelope<T> {
  return { ok: true, data };
}

export function failure(error: unknown): ToolEnvelope<never> {
  return {
    ok: false,
    error: toSerializableError(error)
  };
}

export async function executeTool<T>(operation: () => Promise<T>): Promise<ToolEnvelope<T>> {
  try {
    return success(await operation());
  } catch (error) {
    return failure(error);
  }
}

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  annotations?: ToolAnnotations;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous tool handlers are stored in one registry.
  handler: (input: any) => Promise<ToolEnvelope<Record<string, unknown>>>;
};

export const checksumSchema = z.object({
  algorithm: z.literal("sha256"),
  value: z.string()
});

export const networkInfoSchema = z.object({
  name: z.string().optional(),
  apiUrl: z.string().optional(),
  rpcUrl: z.string().optional(),
  indexerUrl: z.string().optional(),
  explorerUrl: z.string().optional()
});

export const capabilitiesSchema = z.object({
  supportsDelete: z.boolean(),
  supportsSignedUrls: z.boolean(),
  supportsMetadata: z.boolean(),
  supportsBatch: z.boolean(),
  supportsVerification: z.boolean(),
  supportsMedia: z.boolean(),
  supportsPagination: z.boolean(),
  supportsStreamingUpload: z.boolean(),
  supportsStrictMetadataValidation: z.boolean(),
  mode: z.enum(["mock", "real"]),
  notes: z.array(z.string()).optional()
});

export const telemetryStatusSchema = z.object({
  requested: z.boolean(),
  enabled: z.boolean(),
  endpointConfigured: z.boolean(),
  environment: z.string(),
  sampleRate: z.number().min(0).max(1),
  transport: z.enum(["noop", "http"]),
  reason: z.string().optional()
});

export const uploadPolicySchema = z.object({
  strictMetadata: z.boolean(),
  requiredMetadataKeys: z.array(z.string()),
  defaultMetadataKeys: z.array(z.string()),
  maxUploadSizeMb: z.number().int().positive(),
  maxUploadSizeBytes: z.number().int().positive(),
  streamUploadChunkSizeBytes: z.number().int().positive(),
  supportsStreamingUpload: z.boolean(),
  supportsStrictMetadataValidation: z.boolean(),
  destructiveToolsEnabled: z.boolean()
});

export const blobSummarySchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  size: z.number().int().nonnegative(),
  contentType: z.string().optional(),
  createdAt: z.string()
});

export const blobMetadataSchema = blobSummarySchema.extend({
  expiresAt: z.string().optional(),
  checksum: checksumSchema.optional(),
  metadata: metadataRecordSchema.optional(),
  providerMetadata: z.record(z.string(), z.unknown()).optional()
});

export const uploadResultSchema = blobMetadataSchema.extend({
  retrieval: z
    .object({
      url: z.string().optional(),
      note: z.string().optional()
    })
    .optional()
});

export const accountInfoSchema = z.object({
  provider: z.string(),
  mode: z.enum(["mock", "real"]),
  accountId: z.string().optional(),
  network: networkInfoSchema.optional(),
  status: z.enum(["ready", "degraded"]),
  capabilities: capabilitiesSchema,
  notes: z.array(z.string()).optional()
});

export const safePathInfoSchema = z.object({
  ok: z.literal(true),
  safePath: z.string(),
  resolvedPath: z.string(),
  rootPath: z.string(),
  effectiveScope: z.string()
});

export const sandboxStatusSchema = z.object({
  rootPath: z.string(),
  activeScopePath: z.string(),
  effectiveScope: z.string(),
  storageDir: z.string(),
  tempDir: z.string(),
  maxUploadSizeMb: z.number().int().positive(),
  maxReadTextBytes: z.number().int().positive(),
  allowDestructiveTools: z.boolean(),
  restrictions: z.array(z.string())
});

export const listBlobsResultSchema = z.object({
  items: z.array(blobSummarySchema),
  nextCursor: z.string().optional(),
  totalKnown: z.number().int().nonnegative().optional()
});

export const downloadResultSchema = z.object({
  savedPath: z.string(),
  bytesWritten: z.number().int().nonnegative(),
  metadata: blobMetadataSchema
});

export const readBlobTextResultSchema = z.object({
  text: z.string(),
  truncated: z.boolean(),
  bytesRead: z.number().int().nonnegative(),
  metadata: blobMetadataSchema
});

export const blobUrlResultSchema = z.object({
  url: z.string(),
  expiresAt: z.string().optional(),
  note: z.string().optional()
});

export const deleteBlobResultSchema = z.object({
  success: z.boolean(),
  deletedId: z.string()
});

export const batchUploadResultSchema = z.object({
  successes: z.array(uploadResultSchema),
  failures: z.array(
    z.object({
      path: z.string(),
      error: serializableErrorSchema
    })
  )
});

export const verifyBlobResultSchema = z.object({
  verified: z.boolean(),
  checksumLocal: z.string().optional(),
  checksumRemote: z.string().optional(),
  note: z.string().optional(),
  metadata: blobMetadataSchema.optional()
});

export const listLocalUploadCandidatesResultSchema = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      relativePath: z.string(),
      size: z.number().int().nonnegative(),
      contentType: z.string().optional(),
      modifiedAt: z.string()
    })
  ),
  totalDiscovered: z.number().int().nonnegative(),
  truncated: z.boolean()
});

export const healthcheckResultSchema = z.object({
  ok: z.boolean(),
  provider: z.string(),
  mode: z.enum(["mock", "real"]),
  config: z.record(z.string(), z.unknown()),
  warnings: z.array(z.string()),
  uploadPolicy: uploadPolicySchema.optional(),
  telemetry: telemetryStatusSchema.optional()
});

export const emptyInputSchema = z.object({});

export function withOptionalBlobIdentifier<T extends z.ZodRawShape>(shape: T) {
  return z
    .object({
      blobId: z.string().min(1).optional(),
      blobKey: z.string().min(1).optional(),
      ...shape
    })
    .refine(
      (value) =>
        Boolean(
          (value as { blobId?: string; blobKey?: string }).blobId ||
          (value as { blobId?: string; blobKey?: string }).blobKey
        ),
      {
        message: "Either blobId or blobKey is required.",
        path: ["blobId"]
      }
    );
}

export function textContent(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
