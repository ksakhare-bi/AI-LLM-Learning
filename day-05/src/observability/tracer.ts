import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { Serialized } from "@langchain/core/load/serializable";
import type { ChainValues } from "@langchain/core/utils/types";
import type { LLMResult } from "@langchain/core/outputs";

export interface SpanRecord {
  runId: string;
  parentRunId?: string;
  name: string;
  type: "chain" | "llm" | "retriever" | "tool";
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: "running" | "completed" | "error";
  error?: string;
  tokenCount?: number;
  metadata?: Record<string, unknown>;
}

export class InMemoryMetricsTracer extends BaseCallbackHandler {
  name = "InMemoryMetricsTracer";
  private readonly spans = new Map<string, SpanRecord>();
  private readonly tokenCounts = new Map<string, number>();

  constructor() {
    super();
  }

  getSpans(): SpanRecord[] {
    return Array.from(this.spans.values());
  }

  getSpan(runId: string): SpanRecord | undefined {
    return this.spans.get(runId);
  }

  clear(): void {
    this.spans.clear();
    this.tokenCounts.clear();
  }

  handleChainStart(
    chain: Serialized,
    _inputs: ChainValues,
    runId: string,
    parentRunId?: string,
    _tags?: string[],
    metadata?: Record<string, unknown>,
    _runType?: string,
    name?: string
  ): void {
    const spanName = name || (chain?.id ? chain.id.slice(-1)[0] : "RunnableSequence");
    this.spans.set(runId, {
      runId,
      parentRunId,
      name: spanName,
      type: "chain",
      startTime: performance.now(),
      status: "running",
      metadata,
    });
  }

  handleChainEnd(_outputs: ChainValues, runId: string): void {
    const span = this.spans.get(runId);
    if (span) {
      span.endTime = performance.now();
      span.durationMs = Number((span.endTime - span.startTime).toFixed(2));
      span.status = "completed";
    }
  }

  handleChainError(err: unknown, runId: string): void {
    const span = this.spans.get(runId);
    if (span) {
      span.endTime = performance.now();
      span.durationMs = Number((span.endTime - span.startTime).toFixed(2));
      span.status = "error";
      span.error = err instanceof Error ? err.message : String(err);
    }
  }

  handleLLMStart(
    llm: Serialized,
    _prompts: string[],
    runId: string,
    parentRunId?: string,
    _extraParams?: Record<string, unknown>,
    _tags?: string[],
    metadata?: Record<string, unknown>,
    name?: string
  ): void {
    const spanName = name || (llm?.id ? llm.id.slice(-1)[0] : "ChatModel");
    this.spans.set(runId, {
      runId,
      parentRunId,
      name: spanName,
      type: "llm",
      startTime: performance.now(),
      status: "running",
      metadata,
    });
    this.tokenCounts.set(runId, 0);
  }

  handleLLMNewToken(_token: string, _idx: unknown, runId: string): void {
    const current = this.tokenCounts.get(runId) ?? 0;
    this.tokenCounts.set(runId, current + 1);
  }

  handleLLMEnd(_output: LLMResult, runId: string): void {
    const span = this.spans.get(runId);
    if (span) {
      span.endTime = performance.now();
      span.durationMs = Number((span.endTime - span.startTime).toFixed(2));
      span.status = "completed";
      span.tokenCount = this.tokenCounts.get(runId) ?? 0;
    }
  }

  handleLLMError(err: unknown, runId: string): void {
    const span = this.spans.get(runId);
    if (span) {
      span.endTime = performance.now();
      span.durationMs = Number((span.endTime - span.startTime).toFixed(2));
      span.status = "error";
      span.error = err instanceof Error ? err.message : String(err);
    }
  }

  getMetricsSummary(): {
    totalDurationMs: number;
    llmDurationMs: number;
    retrievalDurationMs: number;
    totalSpans: number;
    errorCount: number;
    totalTokens: number;
  } {
    const spans = this.getSpans();
    let totalDurationMs = 0;
    let llmDurationMs = 0;
    let retrievalDurationMs = 0;
    let errorCount = 0;
    let totalTokens = 0;

    for (const span of spans) {
      if (span.status === "error") errorCount++;
      if (span.tokenCount) totalTokens += span.tokenCount;

      if (!span.parentRunId && span.durationMs) {
        totalDurationMs = Math.max(totalDurationMs, span.durationMs);
      }

      if (span.type === "llm" && span.durationMs) {
        llmDurationMs += span.durationMs;
      }

      if (span.name.includes("Retrieval") || span.name.includes("Retriever") || span.type === "retriever") {
        if (span.durationMs) retrievalDurationMs += span.durationMs;
      }
    }

    return {
      totalDurationMs: Number(totalDurationMs.toFixed(2)),
      llmDurationMs: Number(llmDurationMs.toFixed(2)),
      retrievalDurationMs: Number(retrievalDurationMs.toFixed(2)),
      totalSpans: spans.length,
      errorCount,
      totalTokens,
    };
  }

  printTraceTree(): void {
    console.log("\nExecution Trace Summary:");
    const spans = this.getSpans();
    for (const span of spans) {
      const indent = span.parentRunId ? "    └── " : "├── ";
      const dur = span.durationMs ? `${span.durationMs.toFixed(1)}ms` : "pending";
      const tokens = span.tokenCount ? ` (${span.tokenCount} tokens)` : "";
      const statusIcon = span.status === "completed" ? "✓" : span.status === "error" ? "✗" : "⏳";
      console.log(`${indent}[${statusIcon}] ${span.name} [${span.type}] - ${dur}${tokens}`);
    }
  }
}
