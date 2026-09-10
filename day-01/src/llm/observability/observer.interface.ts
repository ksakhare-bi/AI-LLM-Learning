import type { LLMRequest, LLMResponse } from "../types.js";

export interface TraceEvent {
  traceId: string;
  model: string;
  provider: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  cached: boolean;
  retries: number;
  fallbacks: number;
  error?: Error;
  finishReason?: string;
}

export interface LLMObserver {
  readonly name?: string;
  onRequestStart?(traceId: string, request: LLMRequest): void | Promise<void>;
  onRequestEnd?(event: TraceEvent): void | Promise<void>;
  onCacheHit?(traceId: string, request: LLMRequest, response: LLMResponse): void | Promise<void>;
  onRetry?(traceId: string, attempt: number, backoffMs: number, error: unknown): void | Promise<void>;
  onFallback?(traceId: string, fromProvider: string, toProvider: string, error: unknown): void | Promise<void>;
  onError?(traceId: string, error: unknown): void | Promise<void>;
}
