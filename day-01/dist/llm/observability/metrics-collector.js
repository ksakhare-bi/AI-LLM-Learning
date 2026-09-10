export class MetricsCollector {
    name = "metrics-collector";
    totalRequests = 0;
    successfulRequests = 0;
    failedRequests = 0;
    cacheHits = 0;
    totalRetries = 0;
    totalFallbacks = 0;
    totalInputTokens = 0;
    totalOutputTokens = 0;
    totalCostUsd = 0;
    latencies = [];
    onRequestStart(_traceId, _request) {
        this.totalRequests++;
    }
    onCacheHit(_traceId, _request, _response) {
        this.cacheHits++;
    }
    onRetry(_traceId, _attempt, _backoffMs, _error) {
        this.totalRetries++;
    }
    onFallback(_traceId, _fromProvider, _toProvider, _error) {
        this.totalFallbacks++;
    }
    onRequestEnd(event) {
        this.latencies.push(event.latencyMs);
        if (event.error) {
            this.failedRequests++;
        }
        else {
            this.successfulRequests++;
        }
        this.totalInputTokens += event.inputTokens;
        this.totalOutputTokens += event.outputTokens;
        this.totalCostUsd += event.costUsd;
    }
    onError(_traceId, _error) {
        // Handled in onRequestEnd or when request fails before reaching end
    }
    getSnapshot() {
        const sorted = [...this.latencies].sort((a, b) => a - b);
        const count = sorted.length;
        const percentile = (p) => {
            if (count === 0)
                return 0;
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
    reset() {
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
