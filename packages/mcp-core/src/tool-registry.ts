import type { AppLogger } from "../../shared/src/index.js";
import type { ShelbyService } from "../../shelby-service/src/index.js";
import type { ToolEnvelope } from "../../shelby-service/src/types/index.js";
import {
  createAccountTools,
  createBlobTools,
  createSandboxTools,
  type ToolDefinition
} from "./tools/index.js";

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  constructor(
    definitions: ToolDefinition[],
    private readonly logger: AppLogger,
    private readonly service: ShelbyService
  ) {
    for (const definition of definitions) {
      this.tools.set(definition.name, definition);
    }
  }

  list() {
    return [...this.tools.values()];
  }

  get(name: string) {
    return this.tools.get(name);
  }

  async execute(
    name: string,
    rawInput: unknown
  ): Promise<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the registry dispatches many distinct tool result types through one entrypoint.
    ToolEnvelope<any>
  > {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const input = tool.inputSchema.parse(rawInput ?? {});
    const output = await tool.handler(input);
    if (!output.ok) {
      const level = output.error.code === "INTERNAL_ERROR" ? "error" : "warn";
      const logMethod =
        level === "error"
          ? this.logger.error.bind(this.logger)
          : this.logger.warn.bind(this.logger);
      logMethod(
        {
          tool: name,
          error: output.error
        },
        "Shelby MCP tool returned an error.",
        { notifyClient: true }
      );

      try {
        await this.service.telemetry.captureToolError({
          toolName: name,
          providerMode: this.service.config.shelbyProvider,
          errorCode: output.error.code,
          fileSizeBytes:
            typeof output.error.details?.size === "number" ? output.error.details.size : undefined,
          streamingSupported: this.service.provider.capabilities().supportsStreamingUpload,
          strictMetadata: this.service.config.strictMetadata
        });
      } catch {
        // Telemetry failures must never alter tool behavior.
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the parsed envelope matches the selected tool at runtime.
    return tool.outputSchema.parse(output) as ToolEnvelope<any>;
  }
}

export function createToolRegistry(service: ShelbyService, logger: AppLogger): ToolRegistry {
  const definitions = [
    ...createAccountTools(service),
    ...createSandboxTools(service),
    ...createBlobTools(service)
  ];
  logger.debug({ toolCount: definitions.length }, "registered Shelby tools");
  return new ToolRegistry(
    definitions,
    logger.child({ component: "tool-registry" }, "tool-registry"),
    service
  );
}
