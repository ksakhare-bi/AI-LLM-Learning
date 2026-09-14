import { AgentRuntime } from "../src/agent/runtime.js";
import { AgentBudgetExceededError } from "../src/agent/budget.js";
import { ToolRegistry } from "../src/agent/tools/tool-registry.js";
import { ToolExecutor } from "../src/agent/tools/tool-executor.js";
import { calculatorTool } from "../src/agent/tools/calculator.tool.js";
import { createAgentState } from "../src/config/state.js";
import type { AgentDecision } from "../src/config/decision.js";
import type { AgentState } from "../src/config/types.js";

async function runRuntimeBudgetTests() {
  console.log("=".repeat(80));
  console.log("TESTING RUNTIME BUDGET GUARDS & CANCELLATION");
  console.log("=".repeat(80));

  let passed = 0;
  let total = 0;

  const registry = new ToolRegistry();
  registry.register(calculatorTool);
  const executor = new ToolExecutor();

  // -------------------------------------------------------------------------
  // Test 1: Step budget limit enforcement
  // -------------------------------------------------------------------------
  total++;
  try {
    const loopingProvider = {
      async decide(state: AgentState): Promise<AgentDecision> {
        return {
          type: "TOOL_CALL",
          toolCall: { id: `step_${state.currentStep}`, toolName: "calculator", arguments: { a: 1, b: 1 } }
        };
      }
    };

    const runtime = new AgentRuntime(loopingProvider, { maxSteps: 3 }, registry, executor);
    const state = createAgentState({ messages: [{ role: "user", content: "Loop forever" }] });

    let threwBudgetError = false;
    try {
      await runtime.run(state);
    } catch (err) {
      if (err instanceof AgentBudgetExceededError) {
        threwBudgetError = true;
      }
    }

    if (threwBudgetError && state.status === "FAILED" && state.currentStep === 3) {
      console.log("PASS [OK] Test 1: Step budget halted runaway loop precisely at maxSteps");
      passed++;
    } else {
      console.error("FAIL [X] Test 1: Step budget enforcement failed", { threwBudgetError, state });
    }
  } catch (err) {
    console.error("FAIL [X] Test 1 error:", err);
  }

  // -------------------------------------------------------------------------
  // Test 2: Token budget limit enforcement
  // -------------------------------------------------------------------------
  total++;
  try {
    const tokenHeavyProvider = {
      async decide(): Promise<AgentDecision> {
        return {
          type: "TOOL_CALL",
          toolCall: { id: "heavy", toolName: "calculator", arguments: { a: 10, b: 20 } },
          usage: { inputTokens: 400, outputTokens: 200 }
        };
      }
    };

    const runtime = new AgentRuntime(tokenHeavyProvider, { maxSteps: 10, maxTokens: 500 }, registry, executor);
    const state = createAgentState({ messages: [{ role: "user", content: "Token heavy task" }] });

    let threwTokenError = false;
    try {
      await runtime.run(state);
    } catch (err) {
      if (err instanceof AgentBudgetExceededError) {
        threwTokenError = true;
      }
    }

    if (threwTokenError && state.usage.totalTokens >= 500) {
      console.log("PASS [OK] Test 2: Token budget halted execution when totalTokens crossed limit");
      passed++;
    } else {
      console.error("FAIL [X] Test 2: Token budget enforcement failed", { threwTokenError, tokens: state.usage.totalTokens });
    }
  } catch (err) {
    console.error("FAIL [X] Test 2 error:", err);
  }

  // -------------------------------------------------------------------------
  // Test 3: Cancellation via AbortSignal
  // -------------------------------------------------------------------------
  total++;
  try {
    const abortController = new AbortController();

    const provider = {
      async decide(state: AgentState): Promise<AgentDecision> {
        if (state.currentStep === 1) {
          abortController.abort();
        }
        return {
          type: "TOOL_CALL",
          toolCall: { id: "calc_abort", toolName: "calculator", arguments: { a: 2, b: 3 } }
        };
      }
    };

    const runtime = new AgentRuntime(provider, { maxSteps: 10 }, registry, executor, {
      signal: abortController.signal
    });
    const state = createAgentState({ messages: [{ role: "user", content: "Abort me" }] });

    let threwCancelError = false;
    try {
      await runtime.run(state);
    } catch (err) {
      if ((err as Error).message.includes("cancelled")) {
        threwCancelError = true;
      }
    }

    if (threwCancelError && state.status === "CANCELLED") {
      console.log("PASS [OK] Test 3: AbortSignal triggered clean cancellation and marked status CANCELLED");
      passed++;
    } else {
      console.error("FAIL [X] Test 3: Cancellation failed", { threwCancelError, status: state.status });
    }
  } catch (err) {
    console.error("FAIL [X] Test 3 error:", err);
  }

  console.log("\n" + "=".repeat(80));
  console.log(`RUNTIME BUDGET TEST SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log("=".repeat(80) + "\n");

  if (passed !== total) {
    process.exit(1);
  }
}

runRuntimeBudgetTests().catch(err => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
