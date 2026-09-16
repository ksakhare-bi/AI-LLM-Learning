import { runChallengeBenchmark } from "../src/challenge.js";

async function main() {
  console.log("Running Day 03 Challenge Test...");
  const { naive, hybrid, twoStage } = await runChallengeBenchmark();

  if (!twoStage || !naive) {
    throw new Error("Benchmark results missing");
  }

  if (twoStage.avgRecallAtK < 0.8) {
    throw new Error(`Two-stage recall too low: ${twoStage.avgRecallAtK}`);
  }

  console.log("Day 03 Challenge Test Passed Successfully!");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
