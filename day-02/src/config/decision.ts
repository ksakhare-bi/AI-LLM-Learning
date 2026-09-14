export interface DecisionUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export type AgentDecision =
  | {
      type: "FINAL";
      content: string;
      usage?: DecisionUsage;
    }
  | {
      type: "TOOL_CALL";
      toolCall: {
        id: string;
        toolName: string;
        arguments: unknown;
      };
      usage?: DecisionUsage;
    };