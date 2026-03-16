import { z } from "zod";

export const nonEmptyStringSchema = z.string().trim().min(1);

export const metadataRecordSchema = z.record(z.string(), z.string());

export const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema)
  ])
);
