export class ToolRegistry {
    tools = new Map();
    register(tool) {
        if (this.tools.has(tool.name)) {
            throw new Error(`Tool already registered: ${tool.name}`);
        }
        this.tools.set(tool.name, tool);
        return this;
    }
    get(name) {
        return this.tools.get(name);
    }
    has(name) {
        return this.tools.has(name);
    }
    getDefinitions() {
        return Array.from(this.tools.values()).map((t) => t.getDefinition());
    }
    async execute(toolCall) {
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
        }
        catch (err) {
            return {
                toolCallId: toolCall.id,
                name: toolCall.name,
                result: err instanceof Error ? err.message : "Tool execution failed",
                isError: true
            };
        }
    }
    async executeAll(toolCalls) {
        return Promise.all(toolCalls.map((tc) => this.execute(tc)));
    }
}
