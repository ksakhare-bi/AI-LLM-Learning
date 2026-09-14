
export type AgentStatus =
  | "IDLE"
  | "RUNNING"
  | "WAITING_FOR_TOOL"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface AgentToolCall {
  id: string;
  toolName: string;
  arguments: unknown;
}

export interface AgentToolResult {
  toolCallId: string;
  toolName: string;
  success: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AgentCost {
  totalCostUsd: number;
}

export interface AgentMessage { role: MessageRole; content: string; }

export type MessageRole =
  | "system"
  | "user"
  | "assistant"
  | "tool";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type { AgentBudget } from "../agent/budget.js";
export {
  AgentBudgetGuard,
  AgentBudgetExceededError
} from "../agent/budget.js";

export interface LLMMessage {
  role: MessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface AgentState {
  runId: string;

  status: AgentStatus;

  currentStep: number;

  messages: LLMMessage[];

  toolCalls: AgentToolCall[];

  toolResults: AgentToolResult[];

  usage: AgentUsage;

  cost: AgentCost;

  metadata: Record<string, unknown>;
}