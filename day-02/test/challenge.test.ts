import {
  SixStepDecisionProvider,
  extractDataTool,
  validateRecordsTool,
  enrichEntityTool,
  syncExternalApiTool,
  computeAnalyticsTool,
  generateReportTool,
  resetSyncAttempts
} from "../src/challenge.js";
import { AgentRuntime } from "../src/agent/runtime.js";
import { ToolRegistry } from "../src/agent/tools/tool-registry.js";
import { ToolExecutor } from "../src/agent/tools/tool-executor.js";
import { MemoryCheckpointStore } from "../src/agent/persistence/memory-checkpoint-store.js";
import { createAgentState } from "../src/config/state.js";

async function runChallengeTest() {
  console.log("=".repeat(80));
  console.log("RUNNING CODING CHALLENGE UNIT & INTEGRATION TEST");
  console.log("=".repeat(80));

  let passed = 0;
  let total = 0;

  const registry = new ToolRegistry();
  registry.register(extractDataTool);
  registry.register(validateRecordsTool);
  registry.register(enrichEntityTool);
  registry.register(syncExternalApiTool);
  registry.register(computeAnalyticsTool);
  registry.register(generateReportTool);

  const executor = new ToolExecutor({
    timeoutMs: 2000,
    retry: { maxAttempts: 4, baseDelayMs: 20, maxDelayMs: 100 }
  });

  const checkpointStore = new MemoryCheckpointStore();
  const budget = { maxSteps: 12, maxTokens: 4000, maxCostUsd: 0.5 };

  resetSyncAttempts();

  // -------------------------------------------------------------------------
  // Test 1: Agent crashes mid-run after Step 3, checkpoint preserves state
  // -------------------------------------------------------------------------
  total++;
  const run1State = createAgentState({
    messages: [{ role: "user", content: "Execute 6-step workflow" }]
  });
  const runId = run1State.runId;

  const crashingProvider = new SixStepDecisionProvider(true);
  const runtime1 = new AgentRuntime(crashingProvider, budget, registry, executor, { checkpointStore });

  let caughtError: Error | null = null;
  try {
    await runtime1.run(run1State);
  } catch (err) {
    caughtError = err as Error;
  }

  const checkpointAfterCrash = await checkpointStore.load(runId);
  const executedBeforeCrash = checkpointAfterCrash?.toolCalls.map(t => t.toolName) ?? [];

  if (
    caughtError?.message === "PROCESS_KILLED_MID_TASK" &&
    checkpointAfterCrash !== null &&
    checkpointAfterCrash.status === "FAILED" &&
    executedBeforeCrash.includes("extractData") &&
    executedBeforeCrash.includes("validateRecords") &&
    executedBeforeCrash.includes("enrichEntity") &&
    !executedBeforeCrash.includes("syncExternalApi")
  ) {
    console.log("PASS [OK] Test 1: Mid-run crash occurred and checkpoint was accurately preserved in store");
    passed++;
  } else {
    console.error("FAIL [X] Test 1: Crash checkpoint failed", {
      error: caughtError?.message,
      executed: executedBeforeCrash
    });
  }

  // -------------------------------------------------------------------------
  // Test 2: Resume from checkpoint recovers Step 4 failure and finishes all 6 steps
  // -------------------------------------------------------------------------
  total++;
  const resumingProvider = new SixStepDecisionProvider(false);
  const runtime2 = new AgentRuntime(resumingProvider, budget, registry, executor, { checkpointStore });

  const finalState = await runtime2.resume(runId);
  const finalTools = finalState.toolCalls.map(t => t.toolName);

  const expectedTools = [
    "extractData",
    "validateRecords",
    "enrichEntity",
    "syncExternalApi",
    "computeAnalytics",
    "generateReport"
  ];

  const hasAllTools = expectedTools.every(name => finalTools.includes(name));
  const withinBudget =
    finalState.currentStep <= budget.maxSteps &&
    finalState.usage.totalTokens <= budget.maxTokens &&
    finalState.cost.totalCostUsd <= budget.maxCostUsd;

  if (finalState.status === "COMPLETED" && hasAllTools && withinBudget) {
    console.log("PASS [OK] Test 2: Agent resumed mid-run, self-healed Step 4 flaky error, and finished all 6 steps within budget");
    passed++;
  } else {
    console.error("FAIL [X] Test 2: Resume failed", {
      status: finalState.status,
      hasAllTools,
      withinBudget,
      currentStep: finalState.currentStep,
      tokens: finalState.usage.totalTokens
    });
  }

  console.log("\n" + "=".repeat(80));
  console.log(`CHALLENGE TEST SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log("=".repeat(80) + "\n");

  if (passed !== total) {
    process.exit(1);
  }
}

runChallengeTest().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
