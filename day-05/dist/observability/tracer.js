import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
export class InMemoryMetricsTracer extends BaseCallbackHandler {
    name = "InMemoryMetricsTracer";
    spans = new Map();
    tokenCounts = new Map();
    constructor() {
        super();
    }
    getSpans() {
        return Array.from(this.spans.values());
    }
    getSpan(runId) {
        return this.spans.get(runId);
    }
    clear() {
        this.spans.clear();
        this.tokenCounts.clear();
    }
    handleChainStart(chain, _inputs, runId, parentRunId, _tags, metadata, _runType, name) {
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
    handleChainEnd(_outputs, runId) {
        const span = this.spans.get(runId);
        if (span) {
            span.endTime = performance.now();
            span.durationMs = Number((span.endTime - span.startTime).toFixed(2));
            span.status = "completed";
        }
    }
    handleChainError(err, runId) {
        const span = this.spans.get(runId);
        if (span) {
            span.endTime = performance.now();
            span.durationMs = Number((span.endTime - span.startTime).toFixed(2));
            span.status = "error";
            span.error = err instanceof Error ? err.message : String(err);
        }
    }
    handleLLMStart(llm, _prompts, runId, parentRunId, _extraParams, _tags, metadata, name) {
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
    handleLLMNewToken(_token, _idx, runId) {
        const current = this.tokenCounts.get(runId) ?? 0;
        this.tokenCounts.set(runId, current + 1);
    }
    handleLLMEnd(_output, runId) {
        const span = this.spans.get(runId);
        if (span) {
            span.endTime = performance.now();
            span.durationMs = Number((span.endTime - span.startTime).toFixed(2));
            span.status = "completed";
            span.tokenCount = this.tokenCounts.get(runId) ?? 0;
        }
    }
    handleLLMError(err, runId) {
        const span = this.spans.get(runId);
        if (span) {
            span.endTime = performance.now();
            span.durationMs = Number((span.endTime - span.startTime).toFixed(2));
            span.status = "error";
            span.error = err instanceof Error ? err.message : String(err);
        }
    }
    getMetricsSummary() {
        const spans = this.getSpans();
        let totalDurationMs = 0;
        let llmDurationMs = 0;
        let retrievalDurationMs = 0;
        let errorCount = 0;
        let totalTokens = 0;
        for (const span of spans) {
            if (span.status === "error")
                errorCount++;
            if (span.tokenCount)
                totalTokens += span.tokenCount;
            if (!span.parentRunId && span.durationMs) {
                totalDurationMs = Math.max(totalDurationMs, span.durationMs);
            }
            if (span.type === "llm" && span.durationMs) {
                llmDurationMs += span.durationMs;
            }
            if (span.name.includes("Retrieval") || span.name.includes("Retriever") || span.type === "retriever") {
                if (span.durationMs)
                    retrievalDurationMs += span.durationMs;
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
    printTraceTree() {
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
