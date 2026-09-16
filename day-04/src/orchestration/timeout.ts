export class TimeoutError extends Error {
  constructor(timeoutMs: number, operationName = "Operation") {
    super(`${operationName} timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void,
  operationName = "Operation"
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let didTimeout = false;

  // Suppress unhandled rejections if the wrapped operation fails AFTER the timeout fires
  operation.catch(() => {
    /* noop if already timed out */
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      didTimeout = true;
      try {
        onTimeout?.();
      } catch {
        /* ignore cleanup errors */
      }
      reject(new TimeoutError(timeoutMs, operationName));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}