import { LLMClient } from "./llm/client.js";
import { LLMProviderError, LLMRateLimitError } from "./llm/errors.js";
import { ProviderRouter } from "./llm/provider-router.js";
import { MemoryLLMCache } from "./llm/cache/memory-cache.js";
import { LLMBudget } from "./llm/budget.js";
import { MetricsCollector } from "./llm/observability/metrics-collector.js";
import { LeadSchema } from "./llm/validation.js";
/**
 * Chaotic Provider simulating a turbulent upstream LLM:
 * - 60% of requests succeed
 * - 15% fail with HTTP 503 (LLMProviderError)
 * - 15% fail with HTTP 429 (LLMRateLimitError)
 * - 10% simulate hanging/slow latency (>150ms)
 */
class ChaoticPrimaryProvider {
    name = "chaotic-primary";
    callCount = 0;
    async generate(request, signal) {
        this.callCount++;
        const roll = Math.random();
        // Check if aborted
        if (signal?.aborted) {
            throw new Error("Provider request aborted");
        }
        if (roll < 0.10) {
            // Slow latency (simulated timeout)
            await new Promise((resolve, reject) => {
                const timer = setTimeout(resolve, 200);
                signal?.addEventListener("abort", () => {
                    clearTimeout(timer);
                    reject(new Error("Provider request aborted"));
                });
            });
        }
        else if (roll < 0.25) {
            // 503 Provider Error
            throw new LLMProviderError("Primary provider 503 Service Unavailable");
        }
        else if (roll < 0.40) {
            // 429 Rate Limit
            throw new LLMRateLimitError("Primary provider 429 Rate Limit Exceeded");
        }
        else {
            // Normal quick delay
            await new Promise((r) => setTimeout(r, 5 + Math.random() * 10));
        }
        return {
            id: `primary-${crypto.randomUUID()}`,
            model: request.model,
            content: JSON.stringify({
                name: `User ${this.callCount}`,
                email: `user${this.callCount}@example.com`,
                company: "Primary Systems Inc"
            }),
            usage: { inputTokens: 12, outputTokens: 20, totalTokens: 32 },
            finishReason: "stop",
            providerName: this.name
        };
    }
}
/**
 * Resilient Secondary Provider:
 * Acts as the rock-solid fallback.
 */
class ResilientBackupProvider {
    name = "resilient-backup";
    callCount = 0;
    async generate(request) {
        this.callCount++;
        await new Promise((r) => setTimeout(r, 8 + Math.random() * 5));
        return {
            id: `backup-${crypto.randomUUID()}`,
            model: request.model,
            content: JSON.stringify({
                name: `Backup User ${this.callCount}`,
                email: `backup${this.callCount}@fallback.org`,
                company: "Backup Corp"
            }),
            usage: { inputTokens: 12, outputTokens: 20, totalTokens: 32 },
            finishReason: "stop",
            providerName: this.name
        };
    }
}
async function runReliabilityChallenge() {
    console.log("================================================================================");
    console.log("             DAY 01: 500-CALL PRODUCTION RELIABILITY CHALLENGE                  ");
    console.log("================================================================================");
    const TOTAL_CALLS = 500;
    const CONCURRENCY = 20;
    // 1. Setup Chaotic Primary + Resilient Backup in a ProviderRouter
    const primary = new ChaoticPrimaryProvider();
    const backup = new ResilientBackupProvider();
    let fallbackEvents = 0;
    const router = new ProviderRouter([
        { name: "primary-chaotic", provider: primary },
        { name: "backup-resilient", provider: backup }
    ], {
        failureThreshold: 4,
        cooldownMs: 80,
        onFallback: () => {
            fallbackEvents++;
        }
    });
    // 2. Setup Exact-Match Cache
    const cache = new MemoryLLMCache(1000 * 60);
    // 3. Setup Budget Guard
    const budget = new LLMBudget({ maxBudgetUsd: 1.0 });
    // 4. Setup Observability Metrics Collector
    const metrics = new MetricsCollector();
    // 5. Setup LLMClient with tight attempt timeouts and retry budgets
    const client = new LLMClient({
        provider: router,
        timeoutMs: 60, // 60ms attempt timeout
        totalTimeoutMs: 250, // 250ms total deadline per request
        budget,
        cache,
        observers: [metrics]
    });
    console.log(`Firing ${TOTAL_CALLS} requests under concurrency limit = ${CONCURRENCY}...`);
    console.log("Primary provider failure rate: ~40% (Timeouts, 503s, 429s)");
    console.log("Secondary fallback provider active via Circuit Breaker & Fallback Router\n");
    const startTime = Date.now();
    let schemaValidCount = 0;
    let clientErrors = 0;
    // Execute in batches
    for (let i = 0; i < TOTAL_CALLS; i += CONCURRENCY) {
        const batchSize = Math.min(CONCURRENCY, TOTAL_CALLS - i);
        const batchPromises = Array.from({ length: batchSize }, async (_, idx) => {
            const callIndex = i + idx;
            // 20% of calls repeat a cached prompt to demonstrate cache hits
            const promptId = callIndex % 5 === 0 ? "cached-lead" : `unique-lead-${callIndex}`;
            try {
                const res = await client.generate({
                    model: "demo-model",
                    messages: [{ role: "user", content: `Extract lead: ${promptId}` }]
                });
                // Validate output against domain schema
                const parsed = JSON.parse(res.content);
                const check = LeadSchema.safeParse(parsed);
                if (check.success) {
                    schemaValidCount++;
                }
            }
            catch (err) {
                clientErrors++;
            }
        });
        await Promise.all(batchPromises);
        if ((i + batchSize) % 100 === 0 || i + batchSize === TOTAL_CALLS) {
            process.stdout.write(`  -> Completed ${i + batchSize}/${TOTAL_CALLS} requests...\r`);
        }
    }
    const durationMs = Date.now() - startTime;
    const snapshot = metrics.getSnapshot();
    console.log("\n\n================================================================================");
    console.log("                      RELIABILITY CHALLENGE REPORT                              ");
    console.log("================================================================================");
    console.log(`Total Requests Sent:        ${TOTAL_CALLS}`);
    console.log(`Total Wall-Clock Time:      ${durationMs}ms (~${(durationMs / 1000).toFixed(2)}s)`);
    console.log(`Throughput:                 ${((TOTAL_CALLS / durationMs) * 1000).toFixed(1)} req/sec`);
    console.log("--------------------------------------------------------------------------------");
    console.log(`Successful Requests:        ${snapshot.successfulRequests} (${((snapshot.successfulRequests / TOTAL_CALLS) * 100).toFixed(1)}%)`);
    console.log(`Failed Requests:            ${clientErrors} (${((clientErrors / TOTAL_CALLS) * 100).toFixed(1)}%)`);
    console.log(`Schema-Valid Responses:     ${schemaValidCount} (${((schemaValidCount / snapshot.successfulRequests) * 100).toFixed(1)}% of successes)`);
    console.log("--------------------------------------------------------------------------------");
    console.log("LATENCY DISTRIBUTION (ms):");
    console.log(`  Min:                      ${snapshot.latency.min}ms`);
    console.log(`  p50 (Median):             ${snapshot.latency.p50}ms`);
    console.log(`  p95:                      ${snapshot.latency.p95}ms`);
    console.log(`  p99:                      ${snapshot.latency.p99}ms`);
    console.log(`  Max:                      ${snapshot.latency.max}ms`);
    console.log(`  Average:                  ${snapshot.latency.avg}ms`);
    console.log("--------------------------------------------------------------------------------");
    console.log("RELIABILITY & RESILIENCE METRICS:");
    console.log(`  Retries Executed:         ${snapshot.totalRetries}`);
    console.log(`  Fallbacks Triggered:      ${snapshot.totalFallbacks} (router fallback events: ${fallbackEvents})`);
    console.log(`  Cache Hits:               ${snapshot.cacheHits} (${(snapshot.cacheHitRatio * 100).toFixed(1)}%)`);
    console.log("--------------------------------------------------------------------------------");
    console.log("COST & USAGE ACCOUNTING:");
    console.log(`  Total Tokens Consumed:    ${snapshot.totalTokens.toLocaleString()} (${snapshot.totalInputTokens.toLocaleString()} in / ${snapshot.totalOutputTokens.toLocaleString()} out)`);
    console.log(`  Total Incurred Cost:      $${snapshot.totalCostUsd.toFixed(6)} USD`);
    console.log(`  Budget Spent:             $${budget.getSpent().toFixed(6)} USD`);
    console.log(`  Budget Remaining:         $${budget.getRemaining().toFixed(6)} USD`);
    console.log("================================================================================");
    if (snapshot.successfulRequests / TOTAL_CALLS >= 0.95) {
        console.log("RESULT: CHALLENGE PASSED! Gateway maintained bounded latency, cost, and high availability despite a chaotic primary provider.\n");
    }
    else {
        console.warn("RESULT: CHALLENGE COMPLETED WITH HIGH FAILURES.\n");
    }
}
runReliabilityChallenge().catch((err) => {
    console.error("Fatal challenge failure:", err);
    process.exit(1);
});
