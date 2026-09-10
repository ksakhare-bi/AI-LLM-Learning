import type { LLMRequest, LLMResponse } from "../types.js";
import type { LLMObserver, TraceEvent } from "./observer.interface.js";

export class ConsoleObserver implements LLMObserver {
  readonly name = "console-observer";

  constructor(private readonly verbose = false) {}

  onRequestStart(traceId: string, request: LLMRequest): void {
    if (this.verbose) {
      console.log(`[Observer][Start] Trace: ${traceId} | Model: ${request.model} | Messages: ${request.messages.length}`);
    }
  }

  onCacheHit(traceId: string, request: LLMRequest, response: LLMResponse): void {
    console.log(`[Observer][Cache Hit] Trace: ${traceId} | Model: ${request.model} | Response ID: ${response.id}`);
  }

  onRetry(traceId: string, attempt: number, backoffMs: number, error: unknown): void {
    console.warn(`[Observer][Retry] Trace: ${traceId} | Attempt: ${attempt} | Backoff: ${backoffMs}ms | Reason: ${error instanceof Error ? error.message : String(error)}`);
  }

  onFallback(traceId: string, fromProvider: string, toProvider: string, error: unknown): void {
    console.warn(`[Observer][Fallback] Trace: ${traceId} | '${fromProvider}' -> '${toProvider}' | Reason: ${error instanceof Error ? error.message : String(error)}`);
  }

  onRequestEnd(event: TraceEvent): void {
    const status = event.error ? `FAILED (${event.error.message})` : "OK";
    console.log(
      `[Observer][End] Trace: ${event.traceId} | ${event.provider}/${event.model} | ${status} | Latency: ${event.latencyMs}ms | Tokens: ${event.totalTokens} | Cost: $${event.costUsd.toFixed(6)} | Cached: ${event.cached}`
    );
  }

  onError(traceId: string, error: unknown): void {
    console.error(`[Observer][Error] Trace: ${traceId} | ${error instanceof Error ? error.message : String(error)}`);
  }
}
