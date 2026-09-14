
export type ReplayEvent =
  | {
      type: "DECISION";

      step: number;

      decision: unknown;
    }
  | {
      type: "TOOL_RESULT";

      step: number;

      toolCallId: string;

      result: unknown;
    };