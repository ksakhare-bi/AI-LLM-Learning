import type {
  ReplayEvent
} from "./replay-event.js";

import type {
  ReplayLog
} from "./replay-log.js";


export class ReplayRecorder {

  private readonly events: ReplayEvent[] = [];


  constructor(
    public readonly runId: string
  ) {}


  recordDecision(
    step: number,
    decision: unknown
  ): void {

    this.events.push({
      type: "DECISION",
      step,
      decision: structuredClone(
        decision
      )
    });
  }


  recordToolResult(
    step: number,
    toolCallId: string,
    result: unknown
  ): void {

    this.events.push({
      type: "TOOL_RESULT",
      step,
      toolCallId,
      result: structuredClone(
        result
      )
    });
  }


  getEvents(): ReplayEvent[] {

    return structuredClone(
      this.events
    );
  }


  getLog(): ReplayLog {

    return {
      runId: this.runId,

      events:
        this.getEvents()
    };
  }


  clear(): void {

    this.events.length = 0;
  }
}