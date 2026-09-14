import { SelfCritiqueEngine } from "../src/agent/reflection/self-critique-engine.js";
import { ToolRegistry } from "../src/agent/tools/tool-registry.js";
import { calculatorTool } from "../src/agent/tools/calculator.tool.js";
import { createAgentState } from "../src/config/state.js";
import type { AgentDecision } from "../src/config/decision.js";

async function runReflectionTests() {
  console.log("=".repeat(80));
  console.log("TESTING REFLECTION & SELF-CRITIQUE ENGINE");
  console.log("=".repeat(80));

  let passed = 0;
  let total = 0;

  const registry = new ToolRegistry();
  registry.register(calculatorTool);

  const engine = new SelfCritiqueEngine(registry, {
    validateToolExistence: true,
    disallowEmptyArguments: true
  });

  // -------------------------------------------------------------------------
  // Test 1: Tool Hallucination Detection
  // -------------------------------------------------------------------------
  total++;
  try {
    const state = createAgentState();
    const hallucinatedDecision: AgentDecision = {
      type: "TOOL_CALL",
      toolCall: { id: "h1", toolName: "nonExistentTool", arguments: { data: 123 } }
    };

    const critique = await engine.critique(hallucinatedDecision, state);

    if (
      critique.passed === false &&
      critique.reasons.some(r => r.includes("does not exist in registry")) &&
      critique.score < 1.0
    ) {
      console.log("PASS [OK] Test 1: SelfCritiqueEngine caught hallucinated tool name");
      passed++;
    } else {
      console.error("FAIL [X] Test 1: Tool hallucination check failed", critique);
    }
  } catch (err) {
    console.error("FAIL [X] Test 1 error:", err);
  }

  // -------------------------------------------------------------------------
  // Test 2: Missing or Empty Arguments Detection
  // -------------------------------------------------------------------------
  total++;
  try {
    const state = createAgentState();
    const badArgsDecision: AgentDecision = {
      type: "TOOL_CALL",
      toolCall: { id: "c1", toolName: "calculator", arguments: {} }
    };

    const critique = await engine.critique(badArgsDecision, state);

    if (
      critique.passed === false &&
      critique.reasons.some(r => r.includes("empty arguments object"))
    ) {
      console.log("PASS [OK] Test 2: SelfCritiqueEngine caught empty arguments object");
      passed++;
    } else {
      console.error("FAIL [X] Test 2: Empty arguments check failed", critique);
    }
  } catch (err) {
    console.error("FAIL [X] Test 2 error:", err);
  }

  // -------------------------------------------------------------------------
  // Test 3: Unresolved Error Detection in Final Answer
  // -------------------------------------------------------------------------
  total++;
  try {
    const state = createAgentState();
    state.toolResults.push({
      toolCallId: "c_fail",
      toolName: "calculator",
      success: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "Failed", retryable: true }
    });

    const unacknowledgedFinal: AgentDecision = {
      type: "FINAL",
      content: "All calculations succeeded without issues."
    };

    const critique = await engine.critique(unacknowledgedFinal, state);

    if (
      critique.passed === false &&
      critique.reasons.some(r => r.includes("does not acknowledge unresolved tool execution failure"))
    ) {
      console.log("PASS [OK] Test 3: SelfCritiqueEngine caught unacknowledged tool failure in final answer");
      passed++;
    } else {
      console.error("FAIL [X] Test 3: Unresolved error check failed", critique);
    }
  } catch (err) {
    console.error("FAIL [X] Test 3 error:", err);
  }

  // -------------------------------------------------------------------------
  // Test 4: Valid Decision Passes with Perfect Score 1.0
  // -------------------------------------------------------------------------
  total++;
  try {
    const state = createAgentState();
    const validDecision: AgentDecision = {
      type: "TOOL_CALL",
      toolCall: { id: "c_good", toolName: "calculator", arguments: { a: 10, b: 20 } }
    };

    const critique = await engine.critique(validDecision, state);

    if (critique.passed === true && critique.score === 1.0 && critique.reasons.length === 0) {
      console.log("PASS [OK] Test 4: Valid decision passed critique with 1.0 score");
      passed++;
    } else {
      console.error("FAIL [X] Test 4: Valid decision failed critique", critique);
    }
  } catch (err) {
    console.error("FAIL [X] Test 4 error:", err);
  }

  console.log("\n" + "=".repeat(80));
  console.log(`REFLECTION TEST SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log("=".repeat(80) + "\n");

  if (passed !== total) {
    process.exit(1);
  }
}

runReflectionTests().catch(err => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
