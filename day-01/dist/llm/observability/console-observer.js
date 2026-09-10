export class ConsoleObserver {
    verbose;
    name = "console-observer";
    constructor(verbose = false) {
        this.verbose = verbose;
    }
    onRequestStart(traceId, request) {
        if (this.verbose) {
            console.log(`[Observer][Start] Trace: ${traceId} | Model: ${request.model} | Messages: ${request.messages.length}`);
        }
    }
    onCacheHit(traceId, request, response) {
        console.log(`[Observer][Cache Hit] Trace: ${traceId} | Model: ${request.model} | Response ID: ${response.id}`);
    }
    onRetry(traceId, attempt, backoffMs, error) {
        console.warn(`[Observer][Retry] Trace: ${traceId} | Attempt: ${attempt} | Backoff: ${backoffMs}ms | Reason: ${error instanceof Error ? error.message : String(error)}`);
    }
    onFallback(traceId, fromProvider, toProvider, error) {
        console.warn(`[Observer][Fallback] Trace: ${traceId} | '${fromProvider}' -> '${toProvider}' | Reason: ${error instanceof Error ? error.message : String(error)}`);
    }
    onRequestEnd(event) {
        const status = event.error ? `FAILED (${event.error.message})` : "OK";
        console.log(`[Observer][End] Trace: ${event.traceId} | ${event.provider}/${event.model} | ${status} | Latency: ${event.latencyMs}ms | Tokens: ${event.totalTokens} | Cost: $${event.costUsd.toFixed(6)} | Cached: ${event.cached}`);
    }
    onError(traceId, error) {
        console.error(`[Observer][Error] Trace: ${traceId} | ${error instanceof Error ? error.message : String(error)}`);
    }
}
