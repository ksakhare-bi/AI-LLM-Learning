import { AgentRuntime } from "./agent/runtime.js";
import { ToolRegistry } from "./agent/tools/tool-registry.js";
import { ToolExecutor } from "./agent/tools/tool-executor.js";
import { calculatorTool } from "./agent/tools/calculator.tool.js";
import { slowTool } from "./agent/tools/slow.tool.js";
import { flakyTool, resetFlakyToolAttempts } from "./agent/tools/flaky.tool.js";
import { MemoryCheckpointStore } from "./agent/persistence/memory-checkpoint-store.js";
import { ReplayRecorder } from "./agent/replay/replay-recorder.js";
import { ReplayEngine } from "./agent/replay/replay-engine.js";
import { createAgentState } from "./config/state.js";
import type { AgentState } from "./config/types.js";
import type { AgentDecision } from "./config/decision.js";

async function main() {
  // ============================================================================
  // Scenario 1: calculator → successful tool call → final answer
  // ============================================================================
  console.log("\n" + "=".repeat(70));
  console.log("Scenario 1: Calculator → Successful Tool Call → Final Answer");
  console.log("=".repeat(70));

  const registry1 = new ToolRegistry();
  registry1.register(calculatorTool);
  const executor1 = new ToolExecutor();

  const decisionProvider1 = {
    async decide(state: AgentState): Promise<AgentDecision> {
      const lastResult = state.toolResults[state.toolResults.length - 1];
      if (!lastResult) {
        return {
          type: "TOOL_CALL",
          toolCall: {
            id: "calc_1",
            toolName: "calculator",
            arguments: { a: 15, b: 27 }
          }
        };
      }
      return {
        type: "FINAL",
        content: `The sum of 15 and 27 is ${lastResult.result}.`
      };
    }
  };

  const runtime1 = new AgentRuntime(
    decisionProvider1,
    { maxSteps: 10 },
    registry1,
    executor1
  );

  const state1 = createAgentState({
    messages: [{ role: "user", content: "What is 15 + 27?" }]
  });

  const finalState1 = await runtime1.run(state1);
  console.log("Status:", finalState1.status);
  console.log("Tool Calls:", JSON.stringify(finalState1.toolCalls, null, 2));
  console.log("Tool Results:", JSON.stringify(finalState1.toolResults, null, 2));
  console.log(
    "Assistant Final Message:",
    finalState1.messages.find(m => m.role === "assistant")?.content
  );

  // ============================================================================
  // Scenario 2: Invalid calculator input → structured validation error → LLM recovers
  // ============================================================================
  console.log("\n" + "=".repeat(70));
  console.log("Scenario 2: Invalid Input → Structured Validation Error → LLM Recovers");
  console.log("=".repeat(70));

  const registry2 = new ToolRegistry();
  registry2.register(calculatorTool);
  const executor2 = new ToolExecutor();

  const decisionProvider2 = {
    async decide(state: AgentState): Promise<AgentDecision> {
      const lastResult = state.toolResults[state.toolResults.length - 1];

      // Step 1: Initial decision with invalid argument
      if (!lastResult) {
        console.log("-> LLM calls calculator with invalid input: { a: 'fifteen', b: 27 }");
        return {
          type: "TOOL_CALL",
          toolCall: {
            id: "calc_bad",
            toolName: "calculator",
            arguments: { a: "fifteen", b: 27 }
          }
        };
      }

      // Step 2: If previous call failed validation, LLM reads the error and self-corrects
      if (!lastResult.success) {
        console.log(
          `-> LLM observes error [${lastResult.error?.code}]: "${lastResult.error?.message}"`
        );
        console.log("-> LLM self-corrects input to: { a: 15, b: 27 }");
        return {
          type: "TOOL_CALL",
          toolCall: {
            id: "calc_fixed",
            toolName: "calculator",
            arguments: { a: 15, b: 27 }
          }
        };
      }

      // Step 3: Tool succeeded, emit final answer
      return {
        type: "FINAL",
        content: `Recovered from input error. The sum is ${lastResult.result}.`
      };
    }
  };

  const runtime2 = new AgentRuntime(
    decisionProvider2,
    { maxSteps: 10 },
    registry2,
    executor2
  );

  const state2 = createAgentState({
    messages: [{ role: "user", content: "Calculate fifteen plus 27." }]
  });

  const finalState2 = await runtime2.run(state2);
  console.log("Status:", finalState2.status);
  console.log("Total Steps Taken:", finalState2.currentStep);
  console.log("Tool Results Recorded:", finalState2.toolResults.length);
  console.log(
    "Step 1 Validation Error:",
    JSON.stringify(finalState2.toolResults[0].error, null, 2)
  );
  console.log(
    "Step 2 Recovered Result:",
    finalState2.toolResults[1].result
  );
  console.log(
    "Assistant Final Message:",
    finalState2.messages.find(m => m.role === "assistant")?.content
  );

  // ============================================================================
  // Scenario 3: Slow tool → timeout → structured timeout result
  // ============================================================================
  console.log("\n" + "=".repeat(70));
  console.log("Scenario 3: Slow Tool → Timeout → Structured Timeout Result");
  console.log("=".repeat(70));

  const registry3 = new ToolRegistry();
  registry3.register(slowTool);

  // Set timeout to 300ms (slowTool waits 5000ms), 1 attempt to avoid redundant waits
  const executor3 = new ToolExecutor({
    timeoutMs: 300,
    retry: { maxAttempts: 1, baseDelayMs: 50, maxDelayMs: 100 }
  });

  const decisionProvider3 = {
    async decide(state: AgentState): Promise<AgentDecision> {
      const lastResult = state.toolResults[state.toolResults.length - 1];
      if (!lastResult) {
        console.log("-> LLM calls slowTool (configured with 300ms timeout)...");
        return {
          type: "TOOL_CALL",
          toolCall: {
            id: "slow_1",
            toolName: "slowTool",
            arguments: undefined
          }
        };
      }

      console.log(
        `-> LLM receives structured timeout error [${lastResult.error?.code}]: "${lastResult.error?.message}"`
      );
      return {
        type: "FINAL",
        content: `Operation aborted safely: ${lastResult.error?.message}`
      };
    }
  };

  const runtime3 = new AgentRuntime(
    decisionProvider3,
    { maxSteps: 10 },
    registry3,
    executor3
  );

  const state3 = createAgentState({
    messages: [{ role: "user", content: "Perform long-running background task." }]
  });

  const finalState3 = await runtime3.run(state3);
  console.log("Status:", finalState3.status);
  console.log(
    "Recorded Error in State:",
    JSON.stringify(finalState3.toolResults[0].error, null, 2)
  );
  console.log(
    "Assistant Final Message:",
    finalState3.messages.find(m => m.role === "assistant")?.content
  );

  // ============================================================================
  // Scenario 4: Flaky tool → retries internally → success → final answer
  // ============================================================================
  console.log("\n" + "=".repeat(70));
  console.log("Scenario 4: Flaky Tool → Retries Internally → Success → Final Answer");
  console.log("=".repeat(70));

  resetFlakyToolAttempts();
  const registry4 = new ToolRegistry();
  registry4.register(flakyTool);

  const executor4 = new ToolExecutor({
    timeoutMs: 1000,
    retry: {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 500
    }
  });

  const decisionProvider4 = {
    async decide(state: AgentState): Promise<AgentDecision> {
      const lastResult = state.toolResults[state.toolResults.length - 1];
      if (!lastResult) {
        console.log("-> LLM calls flakyTool...");
        return {
          type: "TOOL_CALL",
          toolCall: {
            id: "flaky_1",
            toolName: "flakyTool",
            arguments: undefined
          }
        };
      }

      return {
        type: "FINAL",
        content: `Flaky tool resolved successfully: "${lastResult.result}"`
      };
    }
  };

  const runtime4 = new AgentRuntime(
    decisionProvider4,
    { maxSteps: 10 },
    registry4,
    executor4
  );

  const state4 = createAgentState({
    messages: [{ role: "user", content: "Call flaky third-party API." }]
  });

  const finalState4 = await runtime4.run(state4);
  console.log("Status:", finalState4.status);
  console.log("Tool Result:", finalState4.toolResults[0]);
  console.log(
    "Assistant Final Message:",
    finalState4.messages.find(m => m.role === "assistant")?.content
  );

  // ============================================================================
  // Scenario 5: Run → Checkpoint → Pretend Crash → resume(runId) → Agent Continues
  // ============================================================================
  console.log("\n" + "=".repeat(70));
  console.log("Scenario 5: Run → Checkpoint → Pretend Crash → resume(runId) → Agent Continues");
  console.log("=".repeat(70));

  const checkpointStore = new MemoryCheckpointStore();
  const registry5 = new ToolRegistry();
  registry5.register(calculatorTool);
  const executor5 = new ToolExecutor();

  let hasCrashed = false;

  const decisionProvider5 = {
    async decide(state: AgentState): Promise<AgentDecision> {
      const lastResult = state.toolResults[state.toolResults.length - 1];

      // Step 1: Request tool execution
      if (!lastResult) {
        console.log("-> [Step 1] Initial Decision: Calling calculator with { a: 100, b: 250 }");
        return {
          type: "TOOL_CALL",
          toolCall: {
            id: "calc_checkpoint_demo",
            toolName: "calculator",
            arguments: { a: 100, b: 250 }
          }
        };
      }

      // Step 2: Pretend crash right after tool result was recorded and checkpointed!
      if (!hasCrashed) {
        console.log("-> [Step 2] Tool executed & checkpoint saved to store!");
        console.log("💥 SIMULATING PROCESS CRASH / UNEXPECTED TERMINATION 💥");
        hasCrashed = true;
        throw new Error("PROCESS_CRASH_SIMULATED");
      }

      // Step 3 (After resume): LLM picks up from loaded state and completes
      console.log("-> [After Resume] LLM resumes from checkpoint, inspects tool result, and completes.");
      return {
        type: "FINAL",
        content: `Successfully recovered and resumed from checkpoint! 100 + 250 = ${lastResult.result}.`
      };
    }
  };

  const initialRuntime = new AgentRuntime(
    decisionProvider5,
    { maxSteps: 10 },
    registry5,
    executor5,
    { checkpointStore }
  );

  const state5 = createAgentState({
    messages: [{ role: "user", content: "What is 100 + 250?" }]
  });
  const runId = state5.runId;

  console.log(`Starting Run with ID: ${runId}`);
  try {
    await initialRuntime.run(state5);
  } catch (error) {
    console.log(`Runtime crashed as expected: ${(error as Error).message}`);
  }

  // Inspect the persisted snapshot in the store
  const savedSnapshot = await checkpointStore.load(runId);
  console.log("\n--- Checkpoint Snapshot in Store ---");
  console.log("Run ID:", savedSnapshot?.runId);
  console.log("Status at crash:", savedSnapshot?.status);
  console.log("Current Step:", savedSnapshot?.currentStep);
  console.log("Tool Calls preserved:", savedSnapshot?.toolCalls.length);
  console.log("Tool Results preserved:", savedSnapshot?.toolResults.length);
  console.log("------------------------------------\n");

  // Spin up a brand new runtime instance (simulating server reboot)
  console.log("Spinning up a brand new AgentRuntime instance (simulating server reboot)...");
  const rebootedRuntime = new AgentRuntime(
    decisionProvider5,
    { maxSteps: 10 },
    registry5,
    executor5,
    { checkpointStore }
  );

  console.log(`Resuming run via rebootedRuntime.resume("${runId}")...\n`);
  const resumedFinalState = await rebootedRuntime.resume(runId);

  console.log("Resumed Final Status:", resumedFinalState.status);
  console.log("Total Steps Taken:", resumedFinalState.currentStep);
  console.log(
    "Assistant Final Message:",
    resumedFinalState.messages.find(m => m.role === "assistant")?.content
  );

  // ============================================================================
  // Scenario 6: Replay Recorder → Capturing Complete Decision/Tool Trajectory
  // ============================================================================
  console.log("\n" + "=".repeat(70));
  console.log("Scenario 6: Replay Recorder → Capturing Complete Decision/Tool Trajectory");
  console.log("=".repeat(70));

  const registry6 = new ToolRegistry();
  registry6.register(calculatorTool);
  const executor6 = new ToolExecutor();

  const decisionProvider6 = {
    async decide(state: AgentState): Promise<AgentDecision> {
      const lastResult = state.toolResults[state.toolResults.length - 1];
      if (!lastResult) {
        return {
          type: "TOOL_CALL",
          toolCall: {
            id: "calc_replay_1",
            toolName: "calculator",
            arguments: { a: 15, b: 27 }
          }
        };
      }
      return {
        type: "FINAL",
        content: `The sum of 15 and 27 is ${lastResult.result}.`
      };
    }
  };

  const state6 = createAgentState({
    messages: [{ role: "user", content: "Calculate 15 + 27." }]
  });

  const replayRecorder = new ReplayRecorder(state6.runId);

  const runtime6 = new AgentRuntime(
    decisionProvider6,
    { maxSteps: 10 },
    registry6,
    executor6,
    { replayRecorder }
  );

  const finalState6 = await runtime6.run(state6);

  console.log("Run Completed. Status:", finalState6.status);
  console.log(`Recorder Associated Run ID: ${replayRecorder.runId}`);
  console.log("\n--- Replay Events Captured ---");
  console.log(
    JSON.stringify(
      replayRecorder.getEvents(),
      null,
      2
    )
  );
  console.log("------------------------------\n");

  console.log(
    "\n======================================================================"
  );
  console.log(
    "Scenario 6: Deterministic Replay"
  );
  console.log(
    "======================================================================"
  );

  const replayLog =
    replayRecorder.getLog();

  console.log(
    "Original Run ID:",
    replayLog.runId
  );

  console.log(
    "Recorded Events:",
    replayLog.events.length
  );

  const replayEngine =
    new ReplayEngine();

  const replayedState =
    replayEngine.replay(
      replayLog
    );

  console.log(
    "Replayed Status:",
    replayedState.status
  );

  console.log(
    "Replayed Step:",
    replayedState.currentStep
  );

  console.log(
    "Replayed Tool Calls:",
    replayedState.toolCalls.length
  );

  console.log(
    "Replayed Tool Results:",
    replayedState.toolResults.length
  );

  console.log(
    "Replayed Messages:",
    replayedState.messages.length
  );

  console.log(
    "Replayed Final Message:",
    replayedState.messages.at(-1)
  );

  console.log("\n" + "=".repeat(70));
  console.log("All Integration Scenarios & Replay Completed Successfully!");
  console.log("=".repeat(70) + "\n");
}

main().catch(console.error);