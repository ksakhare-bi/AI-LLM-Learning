import type {
  AgentState,
  AgentToolResult
} from "../../config/types.js";

import type {
  AgentDecision
} from "../../config/decision.js";

import type {
  ReplayEvent
} from "./replay-event.js";

import type {
  ReplayLog
} from "./replay-log.js";


export class ReplayEngine {

  replay(
    log: ReplayLog,
    initialState?: AgentState
  ): AgentState {

    const state =
      initialState ??
      this.createInitialState(
        log.runId
      );


    for (
      const event of log.events
    ) {

      this.applyEvent(
        state,
        event
      );
    }


    return state;
  }


  private applyEvent(
    state: AgentState,
    event: ReplayEvent
  ): void {

    switch (event.type) {

      case "DECISION":

        this.applyDecision(
          state,
          event.step,
          event.decision
        );

        break;


      case "TOOL_RESULT":

        this.applyToolResult(
          state,
          event.toolCallId,
          event.result
        );

        break;
    }
  }


  private applyDecision(
    state: AgentState,
    step: number,
    rawDecision: unknown
  ): void {

    const decision =
      rawDecision as AgentDecision;


    state.currentStep =
      step;


    if (
      decision.type === "TOOL_CALL"
    ) {

      state.toolCalls.push(
        structuredClone(
          decision.toolCall
        )
      );

      state.status =
        "WAITING_FOR_TOOL";

      return;
    }


    if (
      decision.type === "FINAL"
    ) {

      state.messages.push({
        role: "assistant",
        content: decision.content
      });

      state.status =
        "COMPLETED";
    }
  }


  private applyToolResult(
    state: AgentState,
    toolCallId: string,
    rawResult: unknown
  ): void {

    const result =
      rawResult as AgentToolResult;

    state.toolResults.push(
      structuredClone(result)
    );


    state.messages.push({
      role: "tool",
      content: JSON.stringify(
        result
      )
    });


    state.status =
      "RUNNING";
  }


  private createInitialState(
    runId: string
  ): AgentState {

    return {
      runId,

      status: "IDLE",

      currentStep: 0,

      messages: [],

      toolCalls: [],

      toolResults: [],

      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      },

      cost: {
        totalCostUsd: 0
      },

      metadata: {}
    };
  }
}