import { ResearchSpecialist } from "./agents/specialists/researcher.js";
import { DataAnalystSpecialist } from "./agents/specialists/data-analyst.js";
import { ComplianceSpecialist } from "./agents/specialists/compliance-worker.js";
import { Supervisor } from "./orchestration/supervisor.js";
import { runChallenge } from "./challenge.js";
import { runComparativeBenchmark } from "./eval/benchmark.js";
import type { AgentTask } from "./agents/types.js";

async function main() {
  console.log("================================================================================");
  console.log("  DAY 4: MULTI-AGENT ORCHESTRATION AT PRODUCTION QUALITY");
  console.log("================================================================================");

  // DEMO 1: Standard Multi-Agent Supervisor Fan-Out with HITL Interrupt & Resume
  console.log("\n>>> [DEMO 1] Production Multi-Agent Supervisor with HITL Review");
  const workers = [
    new ResearchSpecialist("research-agent", 200),
    new DataAnalystSpecialist("pricing-agent", 250),
    new ComplianceSpecialist("compliance-agent", 180)
  ];

  const supervisor = new Supervisor(workers, {
    workerTimeoutMs: 1000,
    globalTimeoutMs: 3000,
    maxCostUsd: 0.10,
    maxTokens: 20_000,
    hitlEnabled: true,
    hitlCheckpointAgentId: "pricing-agent" // Trigger review on financial modeling
  });

  const task: AgentTask = {
    taskId: "prod-demo-001",
    taskType: "market_entry",
    description: "Formulate pricing and risk model for new AI Agent Orchestration Gateway",
    payload: {
      topic: "Enterprise Multi-Agent Gateway",
      targetTier: "Fortune 500"
    }
  };

  console.log("Dispatching parallel specialist workers (with HITL gate on pricing-agent)...");

  // Automated reviewer simulating human-in-the-loop review (e.g. human manager tweaking the pricing)
  const executionState = await supervisor.execute(task, async (checkpoint) => {
    console.log(`\n  [HITL CHECKPOINT REACHED] Checkpoint ID: ${checkpoint.checkpointId}`);
    console.log(`  Agent under review: ${checkpoint.agentId}`);
    console.log(`  Original Data:`, checkpoint.dataToReview);
    console.log(`  Human Action: EDIT (Adjusting enterprise monthly pricing from $1,200 to $1,800)`);

    const original = checkpoint.dataToReview as Record<string, unknown>;
    const edited = {
      ...original,
      suggestedPricingTier: {
        developerMonthlyUsd: 49,
        enterpriseMonthlyUsd: 1800 // Human adjustment applied
      },
      reviewerComment: "Approved with upgraded enterprise tier pricing"
    };

    return {
      action: "edit",
      reviewer: "cfo@enterprise.ai",
      feedback: "Increased enterprise pricing tier based on Q3 margin requirements",
      editedData: edited,
      timestamp: Date.now()
    };
  });

  console.log("\nSupervisor Execution Completed!");
  console.log(`Status: ${executionState.status}`);
  console.log(`Degraded: ${executionState.degraded}`);
  console.log(`Total Usage: Cost $${executionState.totalUsage.costUsd.toFixed(4)}, Tokens: ${executionState.totalUsage.tokens}, Duration: ${executionState.totalUsage.durationMs}ms`);
  console.log(`State Revisions Recorded: ${executionState.revision}`);
  console.log(`Audit Events Logged: ${executionState.events.length}`);
  console.log(`Aggregated Summary:\n${executionState.aggregatedReport.synthesis.summary}`);

  // DEMO 2: 1-Hour Coding Challenge (Graceful Partial Failure Under Budget)
  console.log("\n\n>>> [DEMO 2] Coding Challenge: Fault-Tolerant Supervisor Under Budget");
  await runChallenge();

  // DEMO 3: Single-Agent vs Multi-Agent Evaluation Benchmark
  console.log("\n\n>>> [DEMO 3] Evaluation Benchmark: Single-Agent vs Multi-Agent Ensemble");
  await runComparativeBenchmark();

  console.log("\n================================================================================");
  console.log("  DAY 4 DEMONSTRATION COMPLETE: ALL SYSTEMS NOMINAL");
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("Fatal error in Day 4 runner:", err);
  process.exit(1);
});