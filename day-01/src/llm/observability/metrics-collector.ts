import type { LLMRequest, LLMResponse } from "../types.js";
import type { LLMObserver, TraceEvent } from "./observer.interface.js";

export interface GatewayMetricsSnapshot {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  cacheHits: number;
  cacheHitRatio: number;
  totalRetries: number;
  totalFallbacks: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  latency: {
    min: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
    avg: number;
  };
}

export class MetricsCollector implements LLMObserver {
  readonly name = "metrics-collector";

  private totalRequests = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  private cacheHits = 0;
  private totalRetries = 0;
  private totalFallbacks = 0;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalCostUsd = 0;
  private latencies: number[] = [];

  onRequestStart(_traceId: string, _request: LLMRequest): void {
    this.totalRequests++;
  }

  onCacheHit(_traceId: string, _request: LLMRequest, _response: LLMResponse): void {
    this.cacheHits++;
  }

  onRetry(_traceId: string, _attempt: number, _backoffMs: number, _error: unknown): void {
    this.totalRetries++;
  }

  onFallback(_traceId: string, _fromProvider: string, _toProvider: string, _error: unknown): void {
    this.totalFallbacks++;
  }

  onRequestEnd(event: TraceEvent): void {
    this.latencies.push(event.latencyMs);

    if (event.error) {
      this.failedRequests++;
    } else {
      this.successfulRequests++;
    }

    this.totalInputTokens += event.inputTokens;
    this.totalOutputTokens += event.outputTokens;
    this.totalCostUsd += event.costUsd;
  }

  onError(_traceId: string, _error: unknown): void {
    // Handled in onRequestEnd or when request fails before reaching end
  }

  getSnapshot(): GatewayMetricsSnapshot {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const count = sorted.length;

    const percentile = (p: number): number => {
      if (count === 0) return 0;
      const idx = Math.min(Math.floor((p / 100) * count), count - 1);
      return sorted[idx] ?? 0;
    };

    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const avg = count > 0 ? Math.round(sum / count) : 0;

    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      cacheHits: this.cacheHits,
      cacheHitRatio: this.totalRequests > 0 ? this.cacheHits / this.totalRequests : 0,
      totalRetries: this.totalRetries,
      totalFallbacks: this.totalFallbacks,
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalTokens: this.totalInputTokens + this.totalOutputTokens,
      totalCostUsd: Number(this.totalCostUsd.toFixed(6)),
      latency: {
        min: sorted[0] ?? 0,
        p50: percentile(50),
        p95: percentile(95),
        p99: percentile(99),
        max: sorted[count - 1] ?? 0,
        avg
      }
    };
  }

  reset(): void {
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.cacheHits = 0;
    this.totalRetries = 0;
    this.totalFallbacks = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.totalCostUsd = 0;
    this.latencies = [];
  }
}
