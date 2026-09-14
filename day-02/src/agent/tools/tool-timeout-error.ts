import { ToolError } from "./tool-error.js";

export class ToolTimeoutError
  extends ToolError {

  constructor(toolName: string, timeoutMs: number) {

    super(
      `Tool "${toolName}" timed out after ${timeoutMs}ms`,
      true,
      "TOOL_TIMEOUT"
    );

    this.name = "ToolTimeoutError";
  }
}