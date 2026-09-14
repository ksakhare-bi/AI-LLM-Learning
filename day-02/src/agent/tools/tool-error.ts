export class ToolError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly code: string
  ) {
    super(message);
    this.name = "ToolError";
  }
}