import { LLMClient } from "./llm/client.js";
import { SuccessLLMProvider } from "./llm/providers/success.provider.js";
import { LeadSchema } from "./llm/validation.js";
import { EvalRunner } from "./llm/eval/eval-runner.js";
import { SchemaValidityEvaluator } from "./llm/eval/schema.evaluator.js";
import { ExactMatchEvaluator } from "./llm/eval/exact-match.evaluator.js";
import {
  LLMAsJudgeEvaluator,
  MockJudgeLLMProvider
} from "./llm/eval/llm-as-judge.evaluator.js";
import type { TestCase } from "./llm/eval/evaluator.interface.js";

async function runCiEvaluation() {
  console.log("================================================================================");
  console.log("                DAY 01 - CI EVALUATION & REGRESSION SUITE                       ");
  console.log("================================================================================");

  const provider = new SuccessLLMProvider();
  const llm = new LLMClient(provider);
  const runner = new EvalRunner();
  const exactEvaluator = new ExactMatchEvaluator();

  const testCases: TestCase[] = [
    {
      id: "TC-01",
      description: "Structured Lead generation produces valid schema (Schema Evaluation)",
      input: {
        model: "demo-model",
        messages: [{ role: "user", content: "Extract lead information" }]
      },
      evaluators: [new SchemaValidityEvaluator(LeadSchema)]
    },
    {
      id: "TC-02",
      description: "Extracted lead email format is exact expected email (Exact Evaluation)",
      input: {
        model: "demo-model",
        messages: [{ role: "user", content: "Extract lead for Fallback User" }]
      },
      expected: "fallback@example.com",
      evaluators: [
        {
          name: "exact-match",
          async evaluate(expected: string, actual: any) {
            const parsed = typeof actual === "string" ? JSON.parse(actual) : actual;
            return exactEvaluator.evaluate(expected, parsed.email);
          }
        }
      ]
    },
    {
      id: "TC-03",
      description: "Structured lead company matches Fallback Corp (Exact Evaluation)",
      input: {
        model: "demo-model",
        messages: [{ role: "user", content: "Extract lead for Fallback Corp" }]
      },
      expected: "Fallback Corp",
      evaluators: [
        {
          name: "exact-match",
          async evaluate(expected: string, actual: any) {
            const parsed = typeof actual === "string" ? JSON.parse(actual) : actual;
            return exactEvaluator.evaluate(expected, parsed.company);
          }
        }
      ]
    },
    {
      id: "TC-04",
      description: "Semantic completeness and factual accuracy (LLM-as-Judge Evaluation)",
      input: {
        model: "demo-model",
        messages: [{ role: "user", content: "Extract lead for Fallback User" }]
      },
      expected: {
        name: "Fallback User",
        email: "fallback@example.com",
        company: "Fallback Corp"
      },
      evaluators: [
        new LLMAsJudgeEvaluator({
          provider: new MockJudgeLLMProvider({
            passed: true,
            score: 1.0,
            reason: "Lead object contains accurate, complete, and schema-compliant contact information matching reference."
          }),
          criteria: "Verify the generated lead accurately matches the expected contact information with valid corporate credentials.",
          passThreshold: 0.8
        })
      ]
    }
  ];

  console.log(`Running ${testCases.length} evaluation test cases through LLMClient...`);

  const report = await runner.runSuite(testCases, async (input) => {
    const res = await llm.generate(input);
    return res.content;
  });

  console.log("\nEvaluation Results:");
  console.log("--------------------------------------------------------------------------------");
  for (const r of report.results) {
    const icon = r.passed ? "PASS [OK]" : "FAIL [X]";
    console.log(`${icon} [${r.testId}] ${r.description} (Score: ${(r.score * 100).toFixed(0)}%)`);
    for (const ev of r.evaluations) {
      if (!ev.result.passed) {
        console.log(`     -> ${ev.evaluatorName}: ${ev.result.reason}`);
      }
    }
  }

  console.log("--------------------------------------------------------------------------------");
  console.log(`Total: ${report.totalTests} | Passed: ${report.passed} | Failed: ${report.failed} | Pass Rate: ${report.passRate}% | Avg Score: ${report.averageScore}`);
  console.log("================================================================================");

  const REQUIRED_PASS_RATE = Number(process.env.EVAL_PASS_THRESHOLD ?? 100);
  console.log(`Evaluation Regression Threshold: ${REQUIRED_PASS_RATE}%`);

  if (report.passRate < REQUIRED_PASS_RATE) {
    console.error(`\n❌ CI Regression Failure: Pass rate ${report.passRate}% is below required threshold of ${REQUIRED_PASS_RATE}%.`);
    process.exit(1);
  } else {
    console.log(`\n✅ CI Regression Passed: All evaluation criteria satisfied (${report.passRate}% >= ${REQUIRED_PASS_RATE}%)!`);
    process.exit(0);
  }
}

runCiEvaluation().catch((err) => {
  console.error("Fatal error during evaluation suite:", err);
  process.exit(1);
});
