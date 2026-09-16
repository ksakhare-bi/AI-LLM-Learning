import { ResearchSpecialist } from "./agents/specialists/researcher.js";
import { DataAnalystSpecialist } from "./agents/specialists/data-analyst.js";
import { FailingWorker } from "./agents/specialists/failing-worker.js";
import { Supervisor } from "./orchestration/supervisor.js";
import type { AgentTask } from "./agents/types.js";
import type { AgentState } from "./orchestration/state.js";
import type { AggregatedReport } from "./orchestration/aggregator.js";

export interface ChallengeResult {
  state: AgentState;
  report: AggregatedReport;
  durationMs: number;
  totalCostUsd: number;
  isDegraded: boolean;
  budgetCompliant: boolean;
  timeCompliant: boolean;
  didHangOrCrash: boolean;
}

export async function runChallenge(): Promise<ChallengeResult> {
  console.log("================================================================================");
  console.log("  DAY 4 CODING CHALLENGE: FAULT-TOLERANT SUPERVISOR UNDER BUDGET");
  console.log("================================================================================");

  const globalBudgetUsd = 0.05;
  const globalTimeoutMs = 1500;
  const workerTimeoutMs = 500;

  // 3 parallel workers: 2 healthy specialists, 1 intentionally failing worker
  const workers = [
    new ResearchSpecialist("research-agent", 250),
    new DataAnalystSpecialist("pricing-agent", 300),
    new FailingWorker("compliance-agent-failing", {
      failureType: "exception",
      delayMs: 200,
      errorMessage: "Downstream KYC compliance API connection refused (503 Service Unavailable)"
    })
  ];

  const supervisor = new Supervisor(workers, {
    workerTimeoutMs,
    globalTimeoutMs,
    maxCostUsd: globalBudgetUsd,
    maxTokens: 10_000,
    requireAllWorkers: false // Enable graceful partial degradation
  });

  const task: AgentTask = {
    taskId: "challenge-task-001",
    taskType: "product_due_diligence",
    description: "Multi-facet enterprise analysis under strict budget with fault injection",
    payload: {
      topic: "Automated Credit Scoring Multi-Agent Architecture",
      budget: 50000
    }
  };

  const startTime = Date.now();
  let executionState: AgentState & { aggregatedReport: AggregatedReport };
  let didHangOrCrash = false;

  try {
    executionState = await supervisor.execute(task);
  } catch (err) {
    didHangOrCrash = true;
    throw new Error(`Supervisor crashed unexpectedly: ${err instanceof Error ? err.message : String(err)}`);
  }

  const durationMs = Date.now() - startTime;
  const totalCostUsd = executionState.totalUsage.costUsd;
  const budgetCompliant = totalCostUsd <= globalBudgetUsd;
  const timeCompliant = durationMs <= globalTimeoutMs;
  const isDegraded = executionState.degraded || executionState.status === "partial";

  console.log(`\nExecution Completed in: ${durationMs}ms (Budget limit: ${globalTimeoutMs}ms)`);
  console.log(`Total Cost: $${totalCostUsd.toFixed(4)} (Budget limit: $${globalBudgetUsd})`);
  console.log(`Status: ${executionState.status.toUpperCase()} | Degraded Flag: ${isDegraded}`);
  console.log(`Successful Results: ${executionState.results.length}/3`);
  console.log(`Recorded Failures: ${executionState.failures.length}/3`);

  console.log("\n--- Failure Telemetry ---");
  for (const failure of executionState.failures) {
    console.log(`  [FAILED] ${failure.agentId} -> Code: ${failure.error?.code}, Message: "${failure.error?.message}"`);
  }

  console.log("\n--- Aggregated Synthesis ---");
  console.log(`  Summary: ${executionState.aggregatedReport.synthesis.summary}`);
  console.log(`  Facets Collected: ${executionState.aggregatedReport.facetsCollected.join(", ")}`);
  console.log(`  Facets Missing: ${executionState.aggregatedReport.facetsMissing.join(", ")}`);
  console.log(`  Quality Score: ${executionState.aggregatedReport.qualityScore}`);

  return {
    state: executionState,
    report: executionState.aggregatedReport,
    durationMs,
    totalCostUsd,
    isDegraded,
    budgetCompliant,
    timeCompliant,
    didHangOrCrash
  };
}

if (process.argv[1]?.endsWith("challenge.ts")) {
  runChallenge()
    .then((res) => {
      if (!res.isDegraded || !res.budgetCompliant || !res.timeCompliant) {
        console.error("\nChallenge validation failed!");
        process.exit(1);
      }
      console.log("\nChallenge PASSED: Graceful degradation achieved within time & cost budgets!");
    })
    .catch((err) => {
      console.error("\nChallenge execution failed:", err);
      process.exit(1);
    });
}
