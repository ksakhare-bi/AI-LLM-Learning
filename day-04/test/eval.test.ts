import assert from "node:assert";
import { runComparativeBenchmark } from "../src/eval/benchmark.js";

async function testEvalBenchmark() {
  console.log("Running Day 4 Single-Agent vs Multi-Agent Evaluation Benchmark Test...");

  const { singleAgentMetrics, multiAgentMetrics, comparisonSummary } = await runComparativeBenchmark();

  assert.ok(singleAgentMetrics, "Missing single-agent metrics");
  assert.ok(multiAgentMetrics, "Missing multi-agent metrics");
  assert.ok(comparisonSummary && comparisonSummary.length > 0, "Missing comparison summary");

  // Multi-Agent should deliver higher quality via specialized domain experts
  assert.ok(
    multiAgentMetrics.qualityScore > singleAgentMetrics.qualityScore,
    `Expected multi-agent quality (${multiAgentMetrics.qualityScore}) > single-agent (${singleAgentMetrics.qualityScore})`
  );

  // Multi-Agent should deliver higher specialization depth
  assert.ok(
    multiAgentMetrics.specializationDepth > singleAgentMetrics.specializationDepth,
    `Expected multi-agent depth (${multiAgentMetrics.specializationDepth}) > single-agent (${singleAgentMetrics.specializationDepth})`
  );

  // Multi-Agent should leverage parallel fan-out to reduce wall-clock latency compared to monolithic sequential processing
  assert.ok(
    multiAgentMetrics.wallClockLatencyMs < singleAgentMetrics.wallClockLatencyMs,
    `Expected multi-agent parallel latency (${multiAgentMetrics.wallClockLatencyMs}ms) < single-agent (${singleAgentMetrics.wallClockLatencyMs}ms)`
  );

  // Multi-Agent token usage and cost are measured and non-zero
  assert.ok(multiAgentMetrics.totalTokens > 0);
  assert.ok(multiAgentMetrics.totalCostUsd > 0);

  console.log("Day 4 Evaluation Benchmark Test Passed Successfully!\n");
}

testEvalBenchmark().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
