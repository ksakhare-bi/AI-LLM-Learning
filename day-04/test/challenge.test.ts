import assert from "node:assert";
import { runChallenge } from "../src/challenge.js";

async function testChallenge() {
  console.log("Running Day 4 Coding Challenge Test...");

  const result = await runChallenge();

  // 1. Verify Graceful Degradation
  assert.strictEqual(result.didHangOrCrash, false, "Supervisor crashed or hung");
  assert.strictEqual(result.isDegraded, true, "Supervisor should flag degraded status on worker failure");
  assert.strictEqual(result.state.status, "partial", "State status should be 'partial'");

  // 2. Verify Partial Results
  assert.strictEqual(result.state.results.length, 2, "Expected exactly 2 successful worker results");
  assert.strictEqual(result.state.failures.length, 1, "Expected exactly 1 failed worker result");

  const successfulAgentIds = result.state.results.map((r) => r.agentId);
  assert.ok(successfulAgentIds.includes("research-agent"), "Research agent result missing");
  assert.ok(successfulAgentIds.includes("pricing-agent"), "Pricing agent result missing");

  const failure = result.state.failures[0];
  assert.strictEqual(failure.agentId, "compliance-agent-failing");
  assert.ok(failure.error?.message.includes("503 Service Unavailable"), "Expected 503 error message in failure payload");

  // 3. Verify Aggregated Synthesis
  assert.strictEqual(result.report.isDegraded, true, "Report should indicate degraded mode");
  assert.ok(result.report.facetsCollected.includes("market_research"));
  assert.ok(result.report.facetsCollected.includes("financial_modeling"));
  assert.ok(result.report.facetsMissing.includes("regulatory_compliance"));

  // 4. Verify Global Budget Ceiling Adherence
  assert.ok(result.budgetCompliant, `Exceeded cost budget: $${result.totalCostUsd} > $0.05`);
  assert.ok(result.totalCostUsd <= 0.05, `Total cost ${result.totalCostUsd} must not exceed $0.05`);
  assert.ok(result.timeCompliant, `Exceeded time budget: ${result.durationMs}ms > 1500ms`);

  console.log("Day 4 Coding Challenge Test Passed Successfully!\n");
}

testChallenge().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
