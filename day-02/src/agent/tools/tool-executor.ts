import type { AgentTool } from "./tool.js";
import { ToolTimeoutError } from "./tool-timeout-error.js";
import { executeWithRetry } from "./tool-retry-executor.js";
import type { ToolRetryOptions } from "./tool-retry.js";

export interface ToolExecutionOptions {
  timeoutMs: number;

  retry: ToolRetryOptions;

  signal?: AbortSignal;
}

export class ToolExecutor {

  constructor(
    private readonly defaultOptions: Partial<ToolExecutionOptions> = {}
  ) {}

  async execute<TInput, TOutput>(
    tool: AgentTool<TInput, TOutput>,
    input: unknown,
    options?: ToolExecutionOptions | AbortSignal
  ): Promise<TOutput> {

    const isSignal = options instanceof AbortSignal;
    const customOpts: Partial<ToolExecutionOptions> =
      !isSignal && typeof options === "object" && options !== null ? options : {};

    const opts: ToolExecutionOptions = {
      timeoutMs:
        customOpts.timeoutMs ??
        this.defaultOptions.timeoutMs ??
        1000,
      retry:
        customOpts.retry ??
        this.defaultOptions.retry ?? {
          maxAttempts: 3,
          baseDelayMs: 100,
          maxDelayMs: 500
        },
      signal: isSignal
        ? options
        : (customOpts.signal ?? this.defaultOptions.signal)
    };

    const validatedInput = tool.validate(input);

    return executeWithRetry(
      () =>
        this.executeOnce(
          tool,
          validatedInput,
          opts
        ),
      opts.retry,
      opts.signal
    );
  }

  private async executeOnce<
    TInput,
    TOutput
  >(
    tool: AgentTool<TInput, TOutput>,
    input: TInput,
    options: ToolExecutionOptions
  ): Promise<TOutput> {

    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => controller.abort(),
        options.timeoutMs
      );

    const signal =
      controller.signal;

    const abortHandler = () => {
      controller.abort();
    };

    try {

      if (options.signal) {

        if (
          options.signal.aborted
        ) {
          controller.abort();
        } else {
          options.signal.addEventListener(
            "abort",
            abortHandler,
            { once: true }
          );
        }
      }

      return await tool.execute(
        input,
        signal
      );

    } catch (error) {

      if (
        signal.aborted &&
        !options.signal?.aborted
      ) {
        throw new ToolTimeoutError(
          tool.name,
          options.timeoutMs
        );
      }

      throw error;

    } finally {

      clearTimeout(timeout);

      options.signal?.removeEventListener(
        "abort",
        abortHandler
      );
    }
  }
}