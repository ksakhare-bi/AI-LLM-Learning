import type {
  LLMRequest,
  LLMResponse
} from "../types.js";

export interface GenerateContext {
  onFallback?: (fromProvider: string, toProvider: string, error: unknown) => void;
}

export interface LLMProvider {
  readonly name?: string;
  generate(
    request: LLMRequest,
    signal?: AbortSignal,
    context?: GenerateContext
  ): Promise<LLMResponse>;
}
