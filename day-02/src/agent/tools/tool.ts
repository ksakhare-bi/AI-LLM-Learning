
export interface AgentTool<TInput = unknown, TOutput = unknown> {
  name: string;

  description: string;

  validate(input: unknown): TInput;

  execute(input: TInput, signal?: AbortSignal): Promise<TOutput>;
}