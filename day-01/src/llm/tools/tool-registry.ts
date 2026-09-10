import type { ToolCall, ToolDefinition, ToolResult } from "../types.js";
import type { Tool } from "./tool.interface.js";

export class ToolRegistry {
  private readonly tools = new Map<string, Tool<any, any>>();

  register(tool: Tool<any, any>): this {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    return this;
  }

  get(name: string): Tool<any, any> | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.getDefinition());
  }

  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const tool = this.tools.get(toolCall.name);

    if (!tool) {
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        result: `Error: Tool '${toolCall.name}' does not exist in registry`,
        isError: true
      };
    }

    // Validate arguments against tool's Zod schema
    const parseResult = tool.schema.safeParse(toolCall.arguments);

    if (!parseResult.success) {
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        result: {
          error: "Invalid tool arguments",
          issues: parseResult.error.issues
        },
        isError: true
      };
    }

    try {
      const output = await tool.execute(parseResult.data);
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        result: output,
        isError: false
      };
    } catch (err: unknown) {
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        result: err instanceof Error ? err.message : "Tool execution failed",
        isError: true
      };
    }
  }

  async executeAll(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    return Promise.all(toolCalls.map((tc) => this.execute(tc)));
  }
}
