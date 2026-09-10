import {
  LLMTimeoutError
} from "./errors.js";

export async function withTimeout<T>(
  operation: (
    signal: AbortSignal
  ) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller =
    new AbortController();

  let timedOut = false;

  const timeout = setTimeout(
    () => {
      timedOut = true;
      controller.abort();
    },
    timeoutMs
  );

  try {
    return await operation(
      controller.signal
    );
  } catch (error) {
    if (timedOut) {
      throw new LLMTimeoutError(
        `LLM request timed out after ${timeoutMs}ms`
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
