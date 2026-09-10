import type { z } from "zod";
import type { ToolDefinition } from "../types.js";

export interface Tool<TArgs = Record<string, unknown>, TResult = unknown> {
  readonly name: string;
  readonly description: string;
  readonly schema: z.ZodType<TArgs>;
  execute(args: TArgs): Promise<TResult>;
  getDefinition(): ToolDefinition;
}
