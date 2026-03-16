import { z } from "zod";
import type { ShelbyService } from "../../../shelby-service/src/index.js";
import {
  createToolEnvelopeSchema,
  emptyInputSchema,
  executeTool,
  safePathInfoSchema,
  sandboxStatusSchema,
  type ToolDefinition
} from "./common.js";

export function createSandboxTools(service: ShelbyService): ToolDefinition[] {
  return [
    {
      name: "shelby_get_safe_path_status",
      description: "Show the current Shelby sandbox root and active narrowed safe path.",
      inputSchema: emptyInputSchema,
      outputSchema: createToolEnvelopeSchema(sandboxStatusSchema),
      annotations: {
        readOnlyHint: true
      },
      handler: () => executeTool(async () => service.sandbox.getStatus())
    },
    {
      name: "shelby_set_safe_path",
      description:
        "Narrow the active safe working scope to a subdirectory inside the current Shelby sandbox.",
      inputSchema: z.object({
        path: z.string().trim().min(1)
      }),
      outputSchema: createToolEnvelopeSchema(safePathInfoSchema),
      annotations: {
        readOnlyHint: false
      },
      handler: (input) => executeTool(() => service.sandbox.setSafePath(input.path))
    }
  ];
}
