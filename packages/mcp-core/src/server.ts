import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";
import type { AppLogger } from "../../shared/src/index.js";
import type { ShelbyService } from "../../shelby-service/src/index.js";
import { McpLogBridge } from "./logging/index.js";
import { createSystemPrompts, type PromptDefinition } from "./prompts/index.js";
import { createSystemResources, type ResourceDefinition } from "./resources/index.js";
import { createToolRegistry, type ToolRegistry } from "./tool-registry.js";
import { textContent } from "./tools/index.js";

type ShelbyMcpServerOptions = {
  name: string;
  version: string;
  service: ShelbyService;
  logger: AppLogger;
};

export class ShelbyMcpCoreServer {
  readonly registry: ToolRegistry;
  readonly resources: ResourceDefinition[];
  readonly prompts: PromptDefinition[];
  private readonly logBridge = new McpLogBridge();

  constructor(private readonly options: ShelbyMcpServerOptions) {
    this.registry = createToolRegistry(options.service, options.logger);
    this.resources = createSystemResources(options.service, this.registry);
    this.prompts = createSystemPrompts();
    options.logger.addSink(this.logBridge);
  }

  listTools() {
    return this.registry.list();
  }

  listResources() {
    return this.resources;
  }

  listPrompts() {
    return this.prompts;
  }

  async callTool(name: string, rawInput: unknown) {
    return this.registry.execute(name, rawInput);
  }

  async readResource(uri: string) {
    const resource = this.resources.find((entry) => entry.uri === uri);
    if (!resource) {
      throw new Error(`Unknown resource: ${uri}`);
    }
    return resource.read();
  }

  async renderPrompt(name: string, rawArgs?: Record<string, unknown>) {
    const prompt = this.prompts.find((entry) => entry.name === name);
    if (!prompt) {
      throw new Error(`Unknown prompt: ${name}`);
    }

    if (prompt.argsSchema) {
      const schema = z.object(prompt.argsSchema);
      const parsed = await Promise.resolve(prompt.render(schema.parse(rawArgs ?? {})));
      return parsed;
    }

    return prompt.render(rawArgs);
  }

  createSdkServer(): McpServer {
    const server = new McpServer({
      name: this.options.name,
      version: this.options.version
    });
    this.logBridge.attach(server);

    for (const tool of this.registry.list()) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          annotations: tool.annotations
        },
        async (args) => {
          const result = (await this.callTool(tool.name, args)) as Record<string, unknown>;
          return {
            structuredContent: result,
            content: [
              {
                type: "text",
                text: textContent(result)
              }
            ]
          };
        }
      );
    }

    for (const resource of this.resources) {
      server.registerResource(
        resource.name,
        resource.uri,
        {
          title: resource.title,
          description: resource.description,
          mimeType: resource.mimeType
        },
        async () => {
          const content = await resource.read();
          return {
            contents: [
              {
                uri: resource.uri,
                mimeType: resource.mimeType,
                text: JSON.stringify(content, null, 2)
              }
            ]
          };
        }
      );
    }

    for (const prompt of this.prompts) {
      server.registerPrompt(
        prompt.name,
        {
          title: prompt.title,
          description: prompt.description,
          argsSchema: prompt.argsSchema
        },
        async (args) => prompt.render(args ?? {})
      );
    }

    return server;
  }

  async connect(transport: Transport): Promise<McpServer> {
    const server = this.createSdkServer();
    await server.connect(transport);
    return server;
  }
}

export function createShelbyMcpCoreServer(options: ShelbyMcpServerOptions) {
  return new ShelbyMcpCoreServer(options);
}
