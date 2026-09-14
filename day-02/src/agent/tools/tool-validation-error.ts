
export class ToolValidationError extends Error {
  constructor(
    public readonly toolName: string,
    message: string
  ) {
    super(`Invalid input for tool "${toolName}": ${message}`);
    this.name = "ToolValidationError";
  }
}