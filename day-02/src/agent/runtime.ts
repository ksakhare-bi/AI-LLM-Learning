
import {
  AgentBudget,
  AgentBudgetGuard
} from "./budget.js";

import { ReplayRecorder } from "./replay/replay-recorder.js";

import {
  ToolRegistry
} from "./tools/tool-registry.js";

import {
  ToolExecutor
} from "./tools/tool-executor.js";

import {
  ToolError
} from "./tools/tool-error.js";

import {
  ToolValidationError
} from "./tools/tool-validation-error.js";

import {
  ToolTimeoutError
} from "./tools/tool-timeout-error.js";
import { AgentState } from "../config/types.js";
import { AgentDecision } from "../config/decision.js";
import { CheckpointStore } from "./persistence/checkpoint-store.js";


export interface AgentDecisionProvider {
  decide(state: AgentState): Promise<AgentDecision>;
}

export interface AgentRuntimeOptions {
  signal?: AbortSignal;
  checkpointStore?: CheckpointStore;
  replayRecorder?: ReplayRecorder;
}

export class AgentRuntime {

  private readonly budgetGuard: AgentBudgetGuard;

  constructor(
    private readonly decisionProvider: AgentDecisionProvider,
    private readonly budget: AgentBudget,
    private readonly toolRegistry: ToolRegistry,
    private readonly toolExecutor: ToolExecutor,
    private readonly options: AgentRuntimeOptions = {}
  ) {
    this.budgetGuard =
      new AgentBudgetGuard(budget);
  }

  async run(
    state: AgentState
  ): Promise<AgentState> {

    state.status = "RUNNING";

    await this.checkpoint(state);

    try {

      while (true) {

        this.checkCancellation();

        this.budgetGuard.check(state);

        const decision =
          await this.step(state);

        if (decision.usage) {
          const input = decision.usage.inputTokens ?? 0;
          const output = decision.usage.outputTokens ?? 0;
          state.usage.inputTokens += input;
          state.usage.outputTokens += output;
          state.usage.totalTokens += (input + output);
          const cost = (input * 0.000003) + (output * 0.000015);
          state.cost.totalCostUsd = Number((state.cost.totalCostUsd + cost).toFixed(6));
          this.budgetGuard.check(state);
        }

        this.options.replayRecorder
          ?.recordDecision(
            state.currentStep,
            decision
          );

        if (decision.type === "FINAL") {
          state.messages.push({
            role: "assistant",
            content: decision.content
          });
          state.status = "COMPLETED";

          await this.checkpoint(state);

          return state;
        }

        await this.executeToolCall(
          state,
          decision
        );
      }

    } catch (error) {

      if (
        (error instanceof DOMException &&
          error.name === "AbortError") ||
        (error instanceof Error &&
          error.message === "Agent execution cancelled")
      ) {
        state.status = "CANCELLED";
      } else {
        state.status = "FAILED";
      }

      await this.checkpoint(state);

      throw error;
    }
  }


  private async step(
    state: AgentState
  ): Promise<AgentDecision> {

    this.checkCancellation();

    state.currentStep += 1;

    return this.decisionProvider.decide(
      state
    );
  }


  private async executeToolCall(
    state: AgentState,
    decision: Extract<
      AgentDecision,
      { type: "TOOL_CALL" }
    >
  ): Promise<void> {

    const {
      toolCall
    } = decision;

    /*
     * Store the tool call in state.
     */
    state.toolCalls.push(
      toolCall
    );

    state.status =
      "WAITING_FOR_TOOL";

    await this.checkpoint(state);


    /*
     * Check whether the tool
     * is registered.
     */
    const tool =
      this.toolRegistry.get(
        toolCall.toolName
      );


    if (!tool) {

      const result = {
        toolCallId: toolCall.id,
        toolName: toolCall.toolName,
        success: false,
        error: {
          code: "UNKNOWN_TOOL",
          message:
            `Tool "${toolCall.toolName}" is not registered`,
          retryable: false
        }
      };

      this.recordToolResult(
        state,
        result
      );

      state.status =
        "RUNNING";

      await this.checkpoint(state);

      return;
    }


    try {

      const result =
        await this.toolExecutor.execute(
          tool,
          toolCall.arguments,
          this.options.signal
        );


      this.recordToolResult(
        state,
        {
          toolCallId: toolCall.id,
          toolName: toolCall.toolName,
          success: true,
          result
        }
      );

    } catch (error) {

      this.recordToolResult(
        state,
        {
          toolCallId: toolCall.id,
          toolName: toolCall.toolName,
          success: false,
          error:
            this.toToolError(error)
        }
      );
    }


    this.checkCancellation();

    state.status = "RUNNING";

    await this.checkpoint(state);
  }


  private recordToolResult(
    state: AgentState,
    result: {
      toolCallId: string;
      toolName: string;
      success: boolean;
      result?: unknown;
      error?: {
        code: string;
        message: string;
        retryable: boolean;
      };
    }
  ): void {

    /*
     * Store structured result.
     */
    state.toolResults.push(
      result
    );


    /*
     * Also expose the result
     * to the LLM as a tool message.
     */
    state.messages.push({
      role: "tool",
      content: JSON.stringify(
        result
      )
    });

    this.options.replayRecorder
      ?.recordToolResult(
        state.currentStep,
        result.toolCallId,
        result
      );
  }


  private toToolError(
    error: unknown
  ): {
    code: string;
    message: string;
    retryable: boolean;
  } {

    if (
      error instanceof ToolValidationError
    ) {
      return {
        code: "TOOL_VALIDATION_ERROR",
        message: error.message,
        retryable: false
      };
    }


    if (
      error instanceof ToolTimeoutError
    ) {
      return {
        code: error.code,
        message: error.message,
        retryable: error.retryable
      };
    }


    if (
      error instanceof ToolError
    ) {
      return {
        code: error.code,
        message: error.message,
        retryable: error.retryable
      };
    }


    if (
      error instanceof Error
    ) {
      return {
        code: "TOOL_EXECUTION_ERROR",
        message: error.message,
        retryable: false
      };
    }


    return {
      code: "TOOL_EXECUTION_ERROR",
      message: "Unknown tool execution error",
      retryable: false
    };
  }


  private checkCancellation(): void {

    if (
      this.options.signal?.aborted
    ) {
      throw new Error(
        "Agent execution cancelled"
      );
    }
  }


  private async checkpoint(
    state: AgentState
  ): Promise<void> {

    if (
      !this.options.checkpointStore
    ) {
      return;
    }

    await this.options.checkpointStore.save(
      state
    );
  }

  async resume(
    runId: string
  ): Promise<AgentState> {

    if (
      !this.options.checkpointStore
    ) {
      throw new Error(
        "Checkpoint store is not configured"
      );
    }

    const state =
      await this.options.checkpointStore.load(
        runId
      );

    if (!state) {
      throw new Error(
        `No checkpoint found for run ${runId}`
      );
    }

    return this.run(state);
  }
}

