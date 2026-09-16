export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();

      reject(
        new Error(
          `Operation timed out after ${timeoutMs}ms`
        )
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      operation,
      timeout
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}