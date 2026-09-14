import type {
  AgentMessage,
  AgentState
} from "./types.js";

export interface CreateAgentStateOptions {
  runId?: string;

  messages?: AgentMessage[];

  metadata?: Record<string, unknown>;
}

export function createAgentState(
  options: CreateAgentStateOptions = {}
): AgentState {
  return {
    runId:
      options.runId ??
      crypto.randomUUID(),

    status: "IDLE",

    currentStep: 0,

    messages:
      options.messages ?? [],

    toolCalls: [],

    toolResults: [],

    usage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    },

    cost: {
      totalCostUsd: 0
    },

    metadata:
      options.metadata ?? {}
  };
}
