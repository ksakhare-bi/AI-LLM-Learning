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

export interface ToolResult {
  toolCallId: string;
  name: string;
  result: unknown;
  isError?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LLMMessage {
  role: MessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  toolChoice?: "auto" | "none" | "required" | { name: string };
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface LLMCost {
  inputTokensCost: number;
  outputTokensCost: number;
  totalTokensCost: number;
  currency: "USD";
}

export interface LLMResponse {
  id: string;
  model: string;
  content: string;
  usage: LLMUsage;
  cost?: LLMCost;
  finishReason: string;
  toolCalls?: ToolCall[];
  cached?: boolean;
  providerName?: string;
}
