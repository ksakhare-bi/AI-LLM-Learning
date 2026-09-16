import assert from "node:assert";
import {
  TransactionalStateManager,
  ConcurrencyConflictError,
  AsyncMutex
} from "../src/orchestration/concurrency.js";
import type { AgentState } from "../src/orchestration/state.js";

async function testConcurrency() {
  console.log("Running Day 4 Concurrency & Race Condition Tests...");

  const createInitialState = (): AgentState => ({
    taskId: "race-test-001",
    status: "running",
    revision: 0,
    workers: {},
    results: [],
    failures: [],
    sharedData: { counter: 0, items: [] },
    events: [],
    hitlCheckpoints: [],
    totalUsage: { tokens: 0, costUsd: 0, durationMs: 0 },
    degraded: false
  });

  // TEST 1: Mutex Lock Protection Under High-Concurrency Load
  console.log("  [Test 1] Testing Mutex Protection under 30 concurrent workers...");
  const manager = new TransactionalStateManager(createInitialState());
  const workerCount = 30;

  // Dispatch 30 concurrent async workers attempting to read-modify-write state simultaneously
  const tasks = Array.from({ length: workerCount }, (_, i) => {
    return async () => {
      // Small randomized jitter to maximize interleaved execution
      await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 20)));

      await manager.atomicMutate(`worker-${i}`, "STATE_MUTATED", (state) => {
        const currentCount = state.sharedData.counter as number;
        state.sharedData.counter = currentCount + 1;
        (state.sharedData.items as string[]).push(`item-from-worker-${i}`);
      });
    };
  });

  await Promise.all(tasks.map((fn) => fn()));

  const snapshot = manager.getSnapshot();

  assert.strictEqual(
    snapshot.sharedData.counter,
    workerCount,
    `Lost update detected! Expected counter to be ${workerCount}, but got ${snapshot.sharedData.counter}`
  );
  assert.strictEqual(
    (snapshot.sharedData.items as string[]).length,
    workerCount,
    `Expected ${workerCount} items in array, but got ${(snapshot.sharedData.items as string[]).length}`
  );
  assert.strictEqual(
    snapshot.revision,
    workerCount,
    `Expected revision to be ${workerCount}, got ${snapshot.revision}`
  );
  assert.strictEqual(
    snapshot.events.length,
    workerCount,
    `Expected ${workerCount} logged events, got ${snapshot.events.length}`
  );

  console.log("    Mutex successfully prevented lost updates across 30 concurrent workers.");

  // TEST 2: Optimistic Concurrency Control (OCC) Conflict Detection
  console.log("  [Test 2] Testing Optimistic Concurrency Control (OCC) conflict rejection...");
  const occManager = new TransactionalStateManager(createInitialState());

  // Worker A reads revision 0
  const revA = occManager.getRevision();
  assert.strictEqual(revA, 0);

  // Worker B reads revision 0
  const revB = occManager.getRevision();
  assert.strictEqual(revB, 0);

  // Worker A successfully commits mutation at revision 0 -> revision advances to 1
  await occManager.mutateWithOCC(revA, "worker-A", "STATE_MUTATED", (state) => {
    state.sharedData.winner = "worker-A";
  });

  assert.strictEqual(occManager.getRevision(), 1);

  // Worker B attempts to commit with stale revision 0 -> MUST fail with ConcurrencyConflictError
  let occFailedAsExpected = false;
  try {
    await occManager.mutateWithOCC(revB, "worker-B", "STATE_MUTATED", (state) => {
      state.sharedData.winner = "worker-B";
    });
  } catch (err) {
    if (err instanceof ConcurrencyConflictError) {
      occFailedAsExpected = true;
      assert.strictEqual(err.expectedRevision, 0);
      assert.strictEqual(err.actualRevision, 1);
    }
  }

  assert.strictEqual(
    occFailedAsExpected,
    true,
    "Expected mutateWithOCC to reject stale update with ConcurrencyConflictError"
  );
  console.log("    OCC correctly rejected stale revision conflict.");

  console.log("Day 4 Concurrency Tests Passed Successfully!\n");
}

testConcurrency().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
