import { runDay05Challenge } from "../src/challenge.js";

async function main() {
  console.log("Running Day 05 Coding Challenge Verification Test...");
  const result = await runDay05Challenge();

  if (!result.success) {
    throw new Error("Challenge failed overall execution check");
  }

  if (!result.retrievalParityPass) {
    throw new Error(`Retrieval metrics below required threshold: Recall=${result.metrics.avgRecallAt3}, MRR=${result.metrics.avgMRR}`);
  }

  if (!result.streamingPass) {
    throw new Error("Streaming token validation failed");
  }

  if (!result.fallbackPass) {
    throw new Error("Configurable fallback mechanism failed to recover from primary error");
  }

  console.log("\n✓ ALL DAY 05 CHALLENGE ASSERTIONS PASSED SUCCESSFULLY!");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
