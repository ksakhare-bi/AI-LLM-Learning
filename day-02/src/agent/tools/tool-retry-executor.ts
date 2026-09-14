import {
  ToolError
} from "./tool-error.js";

import type {
  ToolRetryOptions
} from "./tool-retry.js";

export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  options: ToolRetryOptions,
  signal?: AbortSignal
): Promise<T> {

  let attempt = 0;

  while (
    attempt < options.maxAttempts
  ) {

    if (signal?.aborted) {
      throw new DOMException(
        "Operation cancelled",
        "AbortError"
      );
    }

    attempt++;

    try {

      return await operation();

    } catch (error) {

      const retryable =
        error instanceof ToolError
          ? error.retryable
          : false;

      const isLastAttempt =
        attempt >= options.maxAttempts;

      if (
        !retryable ||
        isLastAttempt
      ) {
        throw error;
      }

      const exponentialDelay =
        Math.min(
          options.baseDelayMs *
            2 ** (attempt - 1),
          options.maxDelayMs
        );

      const jitter =
        Math.random() *
        exponentialDelay *
        0.2;

      const delay =
        exponentialDelay + jitter;

      await sleep(
        delay,
        signal
      );
    }
  }

  throw new Error(
    "Retry execution failed unexpectedly"
  );
}

function sleep(
  ms: number,
  signal?: AbortSignal
): Promise<void> {

  return new Promise(
    (resolve, reject) => {

      const timeout =
        setTimeout(
          resolve,
          ms
        );

      if (!signal) {
        return;
      }

      if (signal.aborted) {

        clearTimeout(timeout);

        reject(
          new DOMException(
            "Operation cancelled",
            "AbortError"
          )
        );

        return;
      }

      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timeout);

          reject(
            new DOMException(
              "Operation cancelled",
              "AbortError"
            )
          );
        },
        { once: true }
      );
    }
  );
}