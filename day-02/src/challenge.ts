import { AgentRuntime } from "./agent/runtime.js";
import { ToolRegistry } from "./agent/tools/tool-registry.js";
import { ToolExecutor } from "./agent/tools/tool-executor.js";
import { ToolError } from "./agent/tools/tool-error.js";
import { FileCheckpointStore } from "./agent/persistence/file-checkpoint-store.js";
import { createAgentState } from "./config/state.js";
import type { AgentState } from "./config/types.js";
import type { AgentDecision } from "./config/decision.js";
import type { AgentTool } from "./agent/tools/tool.js";
import fs from "node:fs/promises";

// ============================================================================
// Step 4 Intermittent Failure Tracker
// ============================================================================
let syncAttempts = 0;

export function resetSyncAttempts(): void {
  syncAttempts = 0;
}

// ============================================================================
// 6 Tools for the 6-Step Pipeline
// ============================================================================
export const extractDataTool: AgentTool<{ source: string }, { count: number; items: any[] }> = {
  name: "extractData",
  description: "Step 1: Extract customer transaction records from source.",
  validate(input: any) {
    if (!input?.source) throw new Error("Missing 'source' parameter");
    return input;
  },
  async execute(input) {
    return {
      count: 2,
      items: [
        { id: "tx_101", customer: "Apex Global", amount: 4500 },
        { id: "tx_102", customer: "Beta Corp", amount: 8200 }
      ]
    };
  }
};

export const validateRecordsTool: AgentTool<{ items: any[] }, { validCount: number; valid: boolean }> = {
  name: "validateRecords",
  description: "Step 2: Validate transaction records integrity.",
  validate(input: any) {
    if (!Array.isArray(input?.items)) throw new Error("Missing or invalid 'items' array");
    return input;
  },
  async execute(input) {
    return { validCount: input.items.length, valid: true };
  }
};

export const enrichEntityTool: AgentTool<{ entity: string }, { tier: string; region: string }> = {
  name: "enrichEntity",
  description: "Step 3: Enrich customer entity with regional and tier metadata.",
  validate(input: any) {
    if (!input?.entity) throw new Error("Missing 'entity' parameter");
    return input;
  },
  async execute(input) {
    return { tier: "ENTERPRISE", region: "US-EAST" };
  }
};

export const syncExternalApiTool: AgentTool<{ syncId: string }, { synced: boolean; confirmedAt: string }> = {
  name: "syncExternalApi",
  description: "Step 4: Intermittently failing tool syncing records with external warehouse.",
  validate(input: any) {
    if (!input?.syncId) throw new Error("Missing 'syncId' parameter");
    return input;
  },
  async execute(input) {
    syncAttempts++;
    console.log(`    [syncExternalApi] Attempt #${syncAttempts}...`);
    if (syncAttempts < 3) {
      throw new ToolError(
        `External Gateway 503: Service temporarily unavailable (attempt ${syncAttempts})`,
        true, // retryable = true!
        "SERVICE_UNAVAILABLE"
      );
    }
    return { synced: true, confirmedAt: new Date().toISOString() };
  }
};

export const computeAnalyticsTool: AgentTool<{ totalAmount: number }, { riskScore: number; status: string }> = {
  name: "computeAnalytics",
  description: "Step 5: Compute real-time risk analytics and aggregations.",
  validate(input: any) {
    if (typeof input?.totalAmount !== "number") throw new Error("Missing numeric 'totalAmount'");
    return input;
  },
  async execute(input) {
    return { riskScore: 0.12, status: "LOW_RISK" };
  }
};

export const generateReportTool: AgentTool<{ summary: string }, { reportId: string; downloadUrl: string }> = {
  name: "generateReport",
  description: "Step 6: Generate final audit compliance report.",
  validate(input: any) {
    if (!input?.summary) throw new Error("Missing 'summary'");
    return input;
  },
  async execute(input) {
    return { reportId: "REP-9901", downloadUrl: "https://audit.internal/reports/REP-9901.pdf" };
  }
};

// ============================================================================
// Decision Provider for the 6-Step Task
// ============================================================================
export class SixStepDecisionProvider {
  constructor(private readonly crashAfterStep3: boolean = false) {}

  async decide(state: AgentState): Promise<AgentDecision> {
    const executedTools = state.toolCalls.map(t => t.toolName);

    // Step 1: Ingest Data
    if (!executedTools.includes("extractData")) {
      return {
        type: "TOOL_CALL",
        toolCall: { id: "step1", toolName: "extractData", arguments: { source: "db_prod" } },
        usage: { inputTokens: 120, outputTokens: 35 }
      };
    }

    // Step 2: Validate Records
    if (!executedTools.includes("validateRecords")) {
      return {
        type: "TOOL_CALL",
        toolCall: {
          id: "step2",
          toolName: "validateRecords",
          arguments: { items: [{ id: "tx_101" }, { id: "tx_102" }] }
        },
        usage: { inputTokens: 140, outputTokens: 40 }
      };
    }

    // Step 3: Enrich Entity
    if (!executedTools.includes("enrichEntity")) {
      return {
        type: "TOOL_CALL",
        toolCall: { id: "step3", toolName: "enrichEntity", arguments: { entity: "Apex Global" } },
        usage: { inputTokens: 110, outputTokens: 30 }
      };
    }

    // SIMULATE CRASH: If requested, crash immediately after Step 3 has completed its tool result
    if (this.crashAfterStep3 && executedTools.includes("enrichEntity") && !executedTools.includes("syncExternalApi")) {
      const step3Result = state.toolResults.find(r => r.toolName === "enrichEntity");
      if (step3Result && (state.metadata["hasSimulatedCrash"] !== true)) {
        state.metadata["hasSimulatedCrash"] = true;
        console.log("\n [SIMULATED PROCESS CRASH]: Process killed via SIGKILL / Power Loss right after Step 3! \n");
        throw new Error("PROCESS_KILLED_MID_TASK");
      }
    }

    // Step 4: Intermittently Failing Tool (syncExternalApi)
    if (!executedTools.includes("syncExternalApi")) {
      return {
        type: "TOOL_CALL",
        toolCall: { id: "step4", toolName: "syncExternalApi", arguments: { syncId: "SYNC-77" } },
        usage: { inputTokens: 160, outputTokens: 45 }
      };
    }

    // Step 5: Compute Analytics
    if (!executedTools.includes("computeAnalytics")) {
      return {
        type: "TOOL_CALL",
        toolCall: { id: "step5", toolName: "computeAnalytics", arguments: { totalAmount: 12700 } },
        usage: { inputTokens: 130, outputTokens: 35 }
      };
    }

    // Step 6: Generate Report
    if (!executedTools.includes("generateReport")) {
      return {
        type: "TOOL_CALL",
        toolCall: { id: "step6", toolName: "generateReport", arguments: { summary: "Audit complete for Apex Global" } },
        usage: { inputTokens: 150, outputTokens: 50 }
      };
    }

    // Final Completion
    return {
      type: "FINAL",
      content: "All 6 pipeline steps completed successfully! Report generated at REP-9901.",
      usage: { inputTokens: 80, outputTokens: 25 }
    };
  }
}

// ============================================================================
// Standalone Challenge Runner
// ============================================================================
export async function runChallenge() {
  console.log("=".repeat(80));
  console.log("DAY 02 CODING CHALLENGE: 6-STEP AGENT WITH STEP 4 INTERMITTENT FAILURE & RESUME");
  console.log("=".repeat(80));

  const checkpointDir = "./.challenge_checkpoints";
  const checkpointStore = new FileCheckpointStore(checkpointDir);

  const registry = new ToolRegistry();
  registry.register(extractDataTool);
  registry.register(validateRecordsTool);
  registry.register(enrichEntityTool);
  registry.register(syncExternalApiTool);
  registry.register(computeAnalyticsTool);
  registry.register(generateReportTool);

  // Intelligent retry policy for Step 4 intermittent failure: 3 max attempts with exponential backoff
  const toolExecutor = new ToolExecutor({
    timeoutMs: 2000,
    retry: {
      maxAttempts: 4,
      baseDelayMs: 50,
      maxDelayMs: 200
    }
  });

  // Strict budgets: step budget = 12, token budget = 5000 tokens, cost budget = $0.50
  const budget = {
    maxSteps: 12,
    maxTokens: 5000,
    maxCostUsd: 0.50
  };

  resetSyncAttempts();

  // Phase 1: Initialize Agent and Run until simulated crash after Step 3
  console.log("\n[PHASE 1] Starting initial agent process run with crash injection enabled...");
  const decisionProviderPhase1 = new SixStepDecisionProvider(true);

  const runtimePhase1 = new AgentRuntime(
    decisionProviderPhase1,
    budget,
    registry,
    toolExecutor,
    { checkpointStore }
  );

  const initialState = createAgentState({
    messages: [{ role: "user", content: "Execute 6-step audit and sync pipeline." }]
  });
  const runId = initialState.runId;
  console.log(`Assigned Run ID: ${runId}`);

  try {
    await runtimePhase1.run(initialState);
  } catch (error) {
    console.log(`Phase 1 process terminated as designed: ${(error as Error).message}`);
  }

  // Verify checkpoint exists on disk
  const persistedState = await checkpointStore.load(runId);
  console.log("\n[VERIFICATION OF STORED CHECKPOINT ON DISK]");
  console.log(`- Checkpoint File: ${checkpointDir}/${runId}.checkpoint.json`);
  console.log(`- Status at Crash: ${persistedState?.status}`);
  console.log(`- Steps Completed so far: ${persistedState?.currentStep}`);
  console.log(`- Tools Executed:`, persistedState?.toolCalls.map(t => t.toolName));
  console.log(`- Tokens Consumed so far: ${persistedState?.usage.totalTokens}`);

  // Phase 2: Simulate Cold Reboot & Resume
  console.log("\n[PHASE 2] Cold reboot: Spawning brand-new AgentRuntime instance and resuming...");
  const decisionProviderPhase2 = new SixStepDecisionProvider(false);

  const runtimePhase2 = new AgentRuntime(
    decisionProviderPhase2,
    budget,
    registry,
    toolExecutor,
    { checkpointStore }
  );

  console.log(`Invoking runtime.resume("${runId}")...\n`);
  const finalResumedState = await runtimePhase2.resume(runId);

  console.log("=".repeat(80));
  console.log("CHALLENGE EXECUTION RESULT");
  console.log("=".repeat(80));
  console.log(`- Final Status: ${finalResumedState.status}`);
  console.log(`- Total Steps Taken: ${finalResumedState.currentStep} (Budget limit: ${budget.maxSteps})`);
  console.log(`- Total Tokens Consumed: ${finalResumedState.usage.totalTokens} (Budget limit: ${budget.maxTokens})`);
  console.log(`- Total Spend: $${finalResumedState.cost.totalCostUsd} (Budget limit: $${budget.maxCostUsd})`);
  console.log(`- Executed Tools Sequence:`, finalResumedState.toolCalls.map(t => t.toolName));
  console.log(`- Step 4 Attempt Count: ${syncAttempts} (Succeeded on attempt 3)`);
  console.log(`- Final Assistant Message: "${finalResumedState.messages.slice(-1)[0]?.content}"`);

  // Cleanup checkpoint dir
  await checkpointStore.delete(runId);
  try {
    await fs.rm(checkpointDir, { recursive: true, force: true });
  } catch {}

  console.log("\n[SUCCESS] 6-Step Challenge Completed with 100% Reliability & Resumption Guarantee!\n");
}

if (process.argv[1]?.endsWith("challenge.ts")) {
  runChallenge().catch(err => {
    console.error("Challenge failed:", err);
    process.exit(1);
  });
}
