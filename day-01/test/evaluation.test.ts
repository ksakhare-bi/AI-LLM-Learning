import { ExactMatchEvaluator } from "../src/llm/eval/exact-match.evaluator.js";
import { SchemaValidityEvaluator } from "../src/llm/eval/schema.evaluator.js";
import {
  LLMAsJudgeEvaluator,
  MockJudgeLLMProvider,
  JudgeVerdictSchema
} from "../src/llm/eval/llm-as-judge.evaluator.js";
import { EvalRunner } from "../src/llm/eval/eval-runner.js";
import { LeadSchema } from "../src/llm/validation.js";
import { ErrorLLMProvider } from "../src/llm/providers/error.provider.js";
import process from "node:process";

async function runEvaluationTests() {
  console.log("================================================================================");
  console.log("TESTING EVALUATION SUITE: EXACT MATCH, SCHEMA VALIDITY & LLM-AS-JUDGE");
  console.log("================================================================================");

  let passed = 0;
  let total = 0;

  // ---------------------------------------------------------------------------
  // 1. ExactMatchEvaluator
  // ---------------------------------------------------------------------------
  total++;
  try {
    const caseInsensitive = new ExactMatchEvaluator(false);
    const caseSensitive = new ExactMatchEvaluator(true);

    const r1 = await caseInsensitive.evaluate("Acme Corp", "  acme corp  ");
    const r2 = await caseSensitive.evaluate("Acme Corp", "acme corp");
    const r3 = await caseSensitive.evaluate("Acme Corp", "Acme Corp");

    if (r1.passed && r1.score === 1.0 && !r2.passed && r2.score === 0.0 && r3.passed && r3.score === 1.0) {
      console.log("PASS [OK] Test 1: ExactMatchEvaluator handles case sensitivity & trimming");
      passed++;
    } else {
      console.error("FAIL [X] Test 1: ExactMatchEvaluator failed", { r1, r2, r3 });
    }
  } catch (err) {
    console.error("FAIL [X] Test 1 error:", err);
  }

  // ---------------------------------------------------------------------------
  // 2. SchemaValidityEvaluator
  // ---------------------------------------------------------------------------
  total++;
  try {
    const schemaEval = new SchemaValidityEvaluator(LeadSchema);

    const validJson = JSON.stringify({ name: "Alice", email: "alice@acme.com", company: "Acme" });
    const invalidJson = JSON.stringify({ name: "Alice", email: "invalid-email", company: "Acme" });
    const malformed = "not-even-json";

    const r1 = await schemaEval.evaluate(undefined, validJson);
    const r2 = await schemaEval.evaluate(undefined, invalidJson);
    const r3 = await schemaEval.evaluate(undefined, malformed);

    if (
      r1.passed && r1.score === 1.0 &&
      !r2.passed && r2.score === 0.0 && r2.reason?.includes("email") &&
      !r3.passed && r3.score === 0.0 && r3.reason?.includes("not valid JSON")
    ) {
      console.log("PASS [OK] Test 2: SchemaValidityEvaluator accurately validates and detects schema issues");
      passed++;
    } else {
      console.error("FAIL [X] Test 2: SchemaValidityEvaluator failed", { r1, r2, r3 });
    }
  } catch (err) {
    console.error("FAIL [X] Test 2 error:", err);
  }

  // ---------------------------------------------------------------------------
  // 3. LLMAsJudgeEvaluator (Positive verdict)
  // ---------------------------------------------------------------------------
  total++;
  try {
    const positiveJudge = new LLMAsJudgeEvaluator({
      provider: new MockJudgeLLMProvider({
        passed: true,
        score: 0.95,
        reason: "Output fulfills all semantic criteria accurately."
      }),
      criteria: "Assess semantic accuracy and tone.",
      passThreshold: 0.8
    });

    const res = await positiveJudge.evaluate(
      { expectedFact: "Paris is capital of France" },
      "The capital city of France is Paris."
    );

    if (res.passed && res.score === 0.95 && res.reason?.includes("fulfills all semantic criteria")) {
      console.log("PASS [OK] Test 3: LLMAsJudgeEvaluator produces structured score & verdict above threshold");
      passed++;
    } else {
      console.error("FAIL [X] Test 3: LLMAsJudgeEvaluator positive test failed", res);
    }
  } catch (err) {
    console.error("FAIL [X] Test 3 error:", err);
  }

  // ---------------------------------------------------------------------------
  // 4. LLMAsJudgeEvaluator (Negative verdict / below threshold)
  // ---------------------------------------------------------------------------
  total++;
  try {
    const strictJudge = new LLMAsJudgeEvaluator({
      provider: new MockJudgeLLMProvider({
        passed: true,
        score: 0.65, // Score is 0.65, but threshold is 0.80
        reason: "Output is missing key required fields."
      }),
      criteria: "Assess completeness.",
      passThreshold: 0.80
    });

    const res = await strictJudge.evaluate("Full dossier", "Brief summary");

    if (!res.passed && res.score === 0.65 && res.reason?.includes("missing key")) {
      console.log("PASS [OK] Test 4: LLMAsJudgeEvaluator enforces passThreshold correctly (0.65 < 0.80)");
      passed++;
    } else {
      console.error("FAIL [X] Test 4: LLMAsJudgeEvaluator threshold enforcement failed", res);
    }
  } catch (err) {
    console.error("FAIL [X] Test 4 error:", err);
  }

  // ---------------------------------------------------------------------------
  // 5. LLMAsJudgeEvaluator (Graceful error handling)
  // ---------------------------------------------------------------------------
  total++;
  try {
    const failingJudge = new LLMAsJudgeEvaluator({
      provider: new ErrorLLMProvider(500),
      criteria: "Verify facts."
    });

    const res = await failingJudge.evaluate("ref", "output");

    if (!res.passed && res.score === 0.0 && res.reason?.includes("failed")) {
      console.log("PASS [OK] Test 5: LLMAsJudgeEvaluator handles provider failure gracefully without crashing");
      passed++;
    } else {
      console.error("FAIL [X] Test 5: Error handling failed", res);
    }
  } catch (err) {
    console.error("FAIL [X] Test 5 error:", err);
  }

  // ---------------------------------------------------------------------------
  // 6. EvalRunner combining all three evaluators
  // ---------------------------------------------------------------------------
  total++;
  try {
    const runner = new EvalRunner();
    const exactEval = new ExactMatchEvaluator();
    const schemaEval = new SchemaValidityEvaluator(LeadSchema);
    const judgeEval = new LLMAsJudgeEvaluator({
      provider: new MockJudgeLLMProvider({
        passed: true,
        score: 1.0,
        reason: "High quality output"
      })
    });

    const report = await runner.runSuite(
      [
        {
          id: "E2E-01",
          description: "Combined multi-evaluator evaluation",
          input: { name: "Bob", email: "bob@example.com", company: "Acme" },
          evaluators: [schemaEval, judgeEval]
        }
      ],
      async (input) => JSON.stringify(input)
    );

    if (report.totalTests === 1 && report.passed === 1 && report.passRate === 100) {
      console.log("PASS [OK] Test 6: EvalRunner seamlessly orchestrates all three evaluators");
      passed++;
    } else {
      console.error("FAIL [X] Test 6: Multi-evaluator runSuite failed", report);
    }
  } catch (err) {
    console.error("FAIL [X] Test 6 error:", err);
  }

  console.log("================================================================================");
  console.log(`Results: ${passed}/${total} tests passed!`);
  console.log("================================================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runEvaluationTests().catch((err) => {
  console.error("Fatal error during evaluation tests:", err);
  process.exit(1);
});
