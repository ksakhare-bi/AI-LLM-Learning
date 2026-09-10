import type {
  LLMRequest,
  LLMResponse,
  ToolResult
} from "./types.js";

import type {
  LLMProvider
} from "./providers/base.provider.js";

import { z } from "zod";

import {
  LLMRequestSchema
} from "./validation.js";

import {
  parseStructuredOutput
} from "./structured-output.js";

import {
  classifyLLMError
} from "./error-classifier.js";

import {
  withTimeout
} from "./timeout.js";

import {
  withRetry
} from "./retry.js";

import {
  calculateCost
} from "./cost.js";

import {
  LLMBudget
} from "./budget.js";

import type { LLMCache } from "./cache/cache.interface.js";
import { generateCacheKey } from "./cache/key-generator.js";

import type { LLMObserver, TraceEvent } from "./observability/observer.interface.js";
import type { ToolRegistry } from "./tools/tool-registry.js";

export interface LLMClientConfig {
  provider: LLMProvider;
  timeoutMs?: number;
  totalTimeoutMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  budget?: LLMBudget;
  cache?: LLMCache;
  observers?: LLMObserver[];
}

export class LLMClient {
  private readonly provider: LLMProvider;
  private readonly timeoutMs: number;
  private readonly totalTimeoutMs: number;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly budget?: LLMBudget;
  private readonly cache?: LLMCache;
  private readonly observers: LLMObserver[];

  constructor(
    providerOrConfig: LLMProvider | LLMClientConfig,
    timeoutMs = 3000,
    totalTimeoutMs = 5000,
    budget?: LLMBudget,
    cache?: LLMCache,
    observers: LLMObserver[] = []
  ) {
    if (typeof providerOrConfig === "object" && "provider" in providerOrConfig) {
      this.provider = providerOrConfig.provider;
      this.timeoutMs = providerOrConfig.timeoutMs ?? 3000;
      this.totalTimeoutMs = providerOrConfig.totalTimeoutMs ?? 5000;
      this.maxAttempts = providerOrConfig.maxAttempts ?? 3;
      this.baseDelayMs = providerOrConfig.baseDelayMs ?? 100;
      this.maxDelayMs = providerOrConfig.maxDelayMs ?? 1000;
      this.budget = providerOrConfig.budget;
      this.cache = providerOrConfig.cache;
      this.observers = providerOrConfig.observers ?? [];
    } else {
      this.provider = providerOrConfig;
      this.timeoutMs = timeoutMs;
      this.totalTimeoutMs = totalTimeoutMs;
      this.maxAttempts = 3;
      this.baseDelayMs = 100;
      this.maxDelayMs = 1000;
      this.budget = budget;
      this.cache = cache;
      this.observers = observers;
    }
  }

  addObserver(observer: LLMObserver): this {
    this.observers.push(observer);
    return this;
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const traceId = crypto.randomUUID();
    const startTime = Date.now();

    // 1. Fail-fast Request Validation
    const parsed = LLMRequestSchema.parse(request);

    // 2. Budget Guard: Prevent request if estimated cost exceeds budget limit
    this.budget?.checkBudget(parsed);

    // 3. Exact-Match Caching: Return zero-cost cached response on hit
    const cacheKey = generateCacheKey(parsed);
    if (this.cache) {
      const cachedResponse = await this.cache.get(cacheKey);
      if (cachedResponse) {
        const latencyMs = Date.now() - startTime;
        for (const obs of this.observers) {
          obs.onCacheHit?.(traceId, parsed, cachedResponse);
          obs.onRequestEnd?.({
            traceId,
            model: cachedResponse.model,
            provider: cachedResponse.providerName ?? this.provider.name ?? "unknown",
            latencyMs,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            costUsd: 0,
            cached: true,
            retries: 0,
            fallbacks: 0,
            finishReason: cachedResponse.finishReason
          });
        }
        return {
          ...cachedResponse,
          cached: true
        };
      }
    }

    // Notify observers of request start
    for (const obs of this.observers) {
      obs.onRequestStart?.(traceId, parsed);
    }

    let retryCount = 0;
    let fallbackCount = 0;

    try {
      // 4. Reliability Layer: withRetry + withTimeout + Circuit Breaker / Fallback Router
      const response = await withRetry(
        (remainingTimeMs) => {
          const attemptTimeout = Math.min(this.timeoutMs, remainingTimeMs);

          return withTimeout(async (signal) => {
            try {
              return await this.provider.generate(parsed, signal, {
                onFallback: (fromProvider, toProvider, error) => {
                  fallbackCount++;
                  for (const obs of this.observers) {
                    obs.onFallback?.(traceId, fromProvider, toProvider, error);
                  }
                }
              });
            } catch (error) {
              throw classifyLLMError(error);
            }
          }, attemptTimeout);
        },
        {
          maxAttempts: this.maxAttempts,
          baseDelayMs: this.baseDelayMs,
          maxDelayMs: this.maxDelayMs,
          totalTimeoutMs: this.totalTimeoutMs,
          onRetry: (attempt, backoffMs, error) => {
            retryCount++;
            for (const obs of this.observers) {
              obs.onRetry?.(traceId, attempt, backoffMs, error);
            }
          }
        }
      );

      // 5. Cost Accounting
      const cost = calculateCost(response.model, response.usage);

      // 6. Record spend in Budget Guard
      this.budget?.recordUsage(response.model, response.usage);

      const latencyMs = Date.now() - startTime;

      const finalResponse: LLMResponse = {
        ...response,
        cost,
        cached: false,
        providerName: response.providerName ?? this.provider.name ?? "unknown"
      };

      // 7. Store in Cache for subsequent identical calls
      if (this.cache) {
        await this.cache.set(cacheKey, finalResponse);
      }

      // 8. Notify Observers of successful completion
      const traceEvent: TraceEvent = {
        traceId,
        model: response.model,
        provider: finalResponse.providerName ?? "unknown",
        latencyMs,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        totalTokens: response.usage.totalTokens,
        costUsd: cost.totalTokensCost,
        cached: false,
        retries: retryCount,
        fallbacks: fallbackCount,
        finishReason: response.finishReason
      };

      for (const obs of this.observers) {
        obs.onRequestEnd?.(traceEvent);
      }

      return finalResponse;
    } catch (error: unknown) {
      const latencyMs = Date.now() - startTime;
      const errorObj = error instanceof Error ? error : new Error(String(error));

      for (const obs of this.observers) {
        obs.onError?.(traceId, error);
        obs.onRequestEnd?.({
          traceId,
          model: parsed.model,
          provider: this.provider.name ?? "unknown",
          latencyMs,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsd: 0,
          cached: false,
          retries: retryCount,
          fallbacks: fallbackCount,
          error: errorObj
        });
      }

      throw error;
    }
  }

  async generateStructured<T>(
    request: LLMRequest,
    schema: z.ZodType<T>
  ): Promise<T> {
    const response = await this.generate(request);
    return parseStructuredOutput(response.content, schema);
  }

  /**
   * Trusted Tool Execution Layer:
   * Safely dispatches tool calls from the LLM response to the ToolRegistry.
   */
  async executeTools(
    response: LLMResponse,
    registry: ToolRegistry
  ): Promise<ToolResult[]> {
    if (!response.toolCalls || response.toolCalls.length === 0) {
      return [];
    }
    return registry.executeAll(response.toolCalls);
  }
}
