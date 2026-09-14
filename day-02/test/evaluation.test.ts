import { PrecisionRecallEvaluator } from "../src/agent/eval/precision-recall.js";
import { TrajectoryScorer } from "../src/agent/eval/trajectory-scorer.js";
import { createAgentState } from "../src/config/state.js";
import type { ExpectedToolSpec } from "../src/agent/eval/types.js";
import type { AgentToolCall } from "../src/config/types.js";

async function runEvaluationUnitTests() {
  console.log("=".repeat(80));
  console.log("TESTING AGENT EVALUATION METRICS: PRECISION/RECALL & TRAJECTORY SCORING");
  console.log("=".repeat(80));

  let passed = 0;
  let total = 0;

  // -------------------------------------------------------------------------
  // 1. Tool-Call Precision & Recall: Perfect Execution
  // -------------------------------------------------------------------------
  total++;
  try {
    const expected: ExpectedToolSpec[] = [
      { toolName: "search" },
      { toolName: "calculator", argumentsMatcher: (args: any) => args.a === 10 }
    ];
    const actual: AgentToolCall[] = [
      { id: "1", toolName: "search", arguments: { q: "test" } },
      { id: "2", toolName: "calculator", arguments: { a: 10, b: 20 } }
    ];

    const metrics = PrecisionRecallEvaluator.evaluate(expected, actual);

    if (
      metrics.truePositives === 2 &&
      metrics.falsePositives === 0 &&
      metrics.falseNegatives === 0 &&
      metrics.precision === 1.0 &&
      metrics.recall === 1.0 &&
      metrics.f1 === 1.0
    ) {
      console.log("PASS [OK] Test 1: PrecisionRecallEvaluator verified 100% precision/recall on ideal trajectory");
      passed++;
    } else {
      console.error("FAIL [X] Test 1: Precision/recall failed", metrics);
    }
  } catch (err) {
    console.error("FAIL [X] Test 1 error:", err);
  }

  // -------------------------------------------------------------------------
  // 2. Tool-Call Precision & Recall: Hallucinated Tool (False Positive)
  // -------------------------------------------------------------------------
  total++;
  try {
    const expected: ExpectedToolSpec[] = [{ toolName: "calculator" }];
    const actual: AgentToolCall[] = [
      { id: "1", toolName: "calculator", arguments: { a: 5, b: 5 } },
      { id: "2", toolName: "hallucinatedTool", arguments: {} } // FP
    ];

    const metrics = PrecisionRecallEvaluator.evaluate(expected, actual);

    if (
      metrics.truePositives === 1 &&
      metrics.falsePositives === 1 &&
      metrics.falseNegatives === 0 &&
      metrics.precision === 0.5 &&
      metrics.recall === 1.0 &&
      metrics.f1 > 0.6
    ) {
      console.log("PASS [OK] Test 2: PrecisionRecallEvaluator penalized hallucinated tool with 0.5 precision");
      passed++;
    } else {
      console.error("FAIL [X] Test 2: False positive evaluation failed", metrics);
    }
  } catch (err) {
    console.error("FAIL [X] Test 2 error:", err);
  }

  // -------------------------------------------------------------------------
  // 3. Tool-Call Precision & Recall: Missing Tool (False Negative)
  // -------------------------------------------------------------------------
  total++;
  try {
    const expected: ExpectedToolSpec[] = [
      { toolName: "toolA" },
      { toolName: "toolB" }
    ];
    const actual: AgentToolCall[] = [
      { id: "1", toolName: "toolA", arguments: {} }
      // toolB omitted (FN)
    ];

    const metrics = PrecisionRecallEvaluator.evaluate(expected, actual);

    if (
      metrics.truePositives === 1 &&
      metrics.falsePositives === 0 &&
      metrics.falseNegatives === 1 &&
      metrics.precision === 1.0 &&
      metrics.recall === 0.5
    ) {
      console.log("PASS [OK] Test 3: PrecisionRecallEvaluator penalized omitted tool with 0.5 recall");
      passed++;
    } else {
      console.error("FAIL [X] Test 3: False negative evaluation failed", metrics);
    }
  } catch (err) {
    console.error("FAIL [X] Test 3 error:", err);
  }

  // -------------------------------------------------------------------------
  // 4. TrajectoryScorer: Optimal vs Inefficient Run
  // -------------------------------------------------------------------------
  total++;
  try {
    const optimalState = createAgentState();
    optimalState.status = "COMPLETED";
    optimalState.currentStep = 3;
    optimalState.toolResults = [
      { toolCallId: "1", toolName: "calc", success: true, result: 10 }
    ];

    const inefficientState = createAgentState();
    inefficientState.status = "COMPLETED";
    inefficientState.currentStep = 9;
    inefficientState.toolResults = [
      { toolCallId: "1", toolName: "calc", success: false, error: { code: "ERR", message: "fail", retryable: false } },
      { toolCallId: "2", toolName: "calc", success: true, result: 10 }
    ];

    const optimalScore = TrajectoryScorer.score(3, 10, optimalState);
    const inefficientScore = TrajectoryScorer.score(3, 10, inefficientState);

    if (
      optimalScore.trajectoryScore === 1.0 &&
      optimalScore.stepEfficiency === 1.0 &&
      inefficientScore.trajectoryScore < optimalScore.trajectoryScore &&
      inefficientScore.stepEfficiency < 1.0
    ) {
      console.log("PASS [OK] Test 4: TrajectoryScorer scored optimal run 1.0 and penalized inefficient/flawed run");
      passed++;
    } else {
      console.error("FAIL [X] Test 4: Trajectory scoring failed", { optimalScore, inefficientScore });
    }
  } catch (err) {
    console.error("FAIL [X] Test 4 error:", err);
  }

  console.log("\n" + "=".repeat(80));
  console.log(`EVALUATION METRICS TEST SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log("=".repeat(80) + "\n");

  if (passed !== total) {
    process.exit(1);
  }
}

runEvaluationUnitTests().catch(err => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
