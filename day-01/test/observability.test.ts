import { LLMClient } from "../src/llm/client.js";
import { FlakyLLMProvider } from "../src/llm/providers/flaky.provider.js";
import { ErrorLLMProvider } from "../src/llm/providers/error.provider.js";
import { SuccessLLMProvider } from "../src/llm/providers/success.provider.js";
import { ProviderRouter } from "../src/llm/provider-router.js";
import { MetricsCollector } from "../src/llm/observability/metrics-collector.js";
import type { LLMObserver, TraceEvent } from "../src/llm/observability/observer.interface.js";
import process from "node:process";

async function runObservabilityTests() {
  console.log("================================================================================");
  console.log("TESTING OBSERVABILITY: RETRY & FALLBACK TRACKING AND OBSERVER PROPAGATION");
  console.log("================================================================================");

  let passed = 0;
  let total = 0;

  // ---------------------------------------------------------------------------
  // Test 1: Retry tracking with FlakyLLMProvider
  // ---------------------------------------------------------------------------
  total++;
  try {
    const flaky = new FlakyLLMProvider(); // Fails 2 times with 503, succeeds on 3rd
    const metrics = new MetricsCollector();
    const retryCalls: Array<{ traceId: string; attempt: number; backoffMs: number }> = [];
    let endEvent: TraceEvent | undefined;

    const testObserver: LLMObserver = {
      onRetry(traceId, attempt, backoffMs, _error) {
        retryCalls.push({ traceId, attempt, backoffMs });
      },
      onRequestEnd(event) {
        endEvent = event;
      }
    };

    const client = new LLMClient({
      provider: flaky,
      timeoutMs: 500,
      totalTimeoutMs: 2000,
      maxAttempts: 3,
      baseDelayMs: 10,
      maxDelayMs: 50,
      observers: [metrics, testObserver]
    });

    const res = await client.generate({
      model: "demo-model",
      messages: [{ role: "user", content: "hello" }]
    });

    const snapshot = metrics.getSnapshot();

    if (
      retryCalls.length === 2 &&
      retryCalls[0].attempt === 1 &&
      retryCalls[1].attempt === 2 &&
      snapshot.totalRetries === 2 &&
      endEvent?.retries === 2 &&
      endEvent?.fallbacks === 0 &&
      res.content.length > 0
    ) {
      console.log("PASS [OK] Test 1: onRetry propagated and retryCount populated (2 retries)");
      passed++;
    } else {
      console.error("FAIL [X] Test 1: Retries not properly tracked", {
        retryCallsLength: retryCalls.length,
        snapshotRetries: snapshot.totalRetries,
        endEventRetries: endEvent?.retries,
        endEventFallbacks: endEvent?.fallbacks
      });
    }
  } catch (err) {
    console.error("FAIL [X] Test 1 threw unexpected error:", err);
  }

  // ---------------------------------------------------------------------------
  // Test 2: Fallback tracking with ProviderRouter
  // ---------------------------------------------------------------------------
  total++;
  try {
    const primaryError = new ErrorLLMProvider(503);
    const backupSuccess = new SuccessLLMProvider();
    const router = new ProviderRouter(
      [
        { name: "primary", provider: primaryError },
        { name: "backup", provider: backupSuccess }
      ],
      { failureThreshold: 3, cooldownMs: 1000 }
    );

    const metrics = new MetricsCollector();
    const fallbackCalls: Array<{ traceId: string; from: string; to: string }> = [];
    let endEvent: TraceEvent | undefined;

    const testObserver: LLMObserver = {
      onFallback(traceId, fromProvider, toProvider, _error) {
        fallbackCalls.push({ traceId, from: fromProvider, to: toProvider });
      },
      onRequestEnd(event) {
        endEvent = event;
      }
    };

    const client = new LLMClient({
      provider: router,
      timeoutMs: 500,
      totalTimeoutMs: 2000,
      observers: [metrics, testObserver]
    });

    const res = await client.generate({
      model: "demo-model",
      messages: [{ role: "user", content: "hello" }]
    });

    const snapshot = metrics.getSnapshot();

    if (
      fallbackCalls.length === 1 &&
      fallbackCalls[0].from === "primary" &&
      fallbackCalls[0].to === "backup" &&
      snapshot.totalFallbacks === 1 &&
      endEvent?.fallbacks === 1 &&
      endEvent?.retries === 0 &&
      res.providerName === "backup"
    ) {
      console.log("PASS [OK] Test 2: onFallback propagated and fallbacks populated (1 fallback)");
      passed++;
    } else {
      console.error("FAIL [X] Test 2: Fallbacks not properly tracked", {
        fallbackCallsLength: fallbackCalls.length,
        snapshotFallbacks: snapshot.totalFallbacks,
        endEventFallbacks: endEvent?.fallbacks,
        endEventRetries: endEvent?.retries
      });
    }
  } catch (err) {
    console.error("FAIL [X] Test 2 threw unexpected error:", err);
  }

  // ---------------------------------------------------------------------------
  // Test 3: Both Retries and Fallbacks on failure
  // ---------------------------------------------------------------------------
  total++;
  try {
    const error1 = new ErrorLLMProvider(503);
    const error2 = new ErrorLLMProvider(503);
    const router = new ProviderRouter(
      [
        { name: "failing-1", provider: error1 },
        { name: "failing-2", provider: error2 }
      ],
      { failureThreshold: 5, cooldownMs: 1000 }
    );

    const metrics = new MetricsCollector();
    let endEvent: TraceEvent | undefined;

    const testObserver: LLMObserver = {
      onRequestEnd(event) {
        endEvent = event;
      }
    };

    const client = new LLMClient({
      provider: router,
      timeoutMs: 50,
      totalTimeoutMs: 300,
      maxAttempts: 2,
      baseDelayMs: 10,
      maxDelayMs: 20,
      observers: [metrics, testObserver]
    });

    try {
      await client.generate({
        model: "demo-model",
        messages: [{ role: "user", content: "hello" }]
      });
      console.error("FAIL [X] Test 3: Expected request to throw but succeeded");
    } catch {
      // Expected to fail
      const snapshot = metrics.getSnapshot();
      if (
        snapshot.totalRetries === 1 &&
        snapshot.totalFallbacks === 2 && // 1 fallback per attempt * 2 attempts = 2 fallbacks
        endEvent?.retries === 1 &&
        endEvent?.fallbacks === 2 &&
        endEvent?.error !== undefined
      ) {
        console.log("PASS [OK] Test 3: Retries and fallbacks properly reported on failed request TraceEvent");
        passed++;
      } else {
        console.error("FAIL [X] Test 3: Failed request metrics mismatch", {
          snapshotRetries: snapshot.totalRetries,
          snapshotFallbacks: snapshot.totalFallbacks,
          endEventRetries: endEvent?.retries,
          endEventFallbacks: endEvent?.fallbacks,
          hasError: !!endEvent?.error
        });
      }
    }
  } catch (err) {
    console.error("FAIL [X] Test 3 unexpected error:", err);
  }

  console.log("================================================================================");
  console.log(`Results: ${passed}/${total} tests passed!`);
  console.log("================================================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runObservabilityTests().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
