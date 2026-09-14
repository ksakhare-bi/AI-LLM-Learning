import type { AgentTool } from "./tool.js";
import { ToolError } from "./tool-error.js";

let attempts = 0;

export function resetFlakyToolAttempts(): void {
  attempts = 0;
}

export const flakyTool:
  AgentTool<void, string> = {

  name: "flakyTool",

  description:
    "Fails twice and succeeds on the third attempt.",

  validate(input) {

    if (input !== undefined) {
      throw new ToolError(
        "No input expected",
        false,
        "INVALID_INPUT"
      );
    }

    return undefined;
  },

  async execute(
    _input,
    _signal
  ) {

    attempts++;

    console.log(
      `Tool attempt: ${attempts}`
    );

    if (attempts < 3) {
      throw new ToolError(
        "Temporary service failure",
        true,
        "SERVICE_UNAVAILABLE"
      );
    }

    return "Success";
  }
};