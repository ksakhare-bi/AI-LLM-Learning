import { LLMError, LLMTimeoutError } from "./errors.js";
function calculateBackoff(attempt, baseDelayMs, maxDelayMs) {
    const exponentialDelay = baseDelayMs *
        Math.pow(2, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
    const jitter = Math.random() *
        cappedDelay;
    return Math.floor(cappedDelay + jitter);
}
export async function withRetry(operation, config) {
    const startTime = Date.now();
    let lastError;
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
        const elapsed = Date.now() - startTime;
        const remainingTime = config.totalTimeoutMs -
            elapsed;
        if (remainingTime <= 0) {
            throw new LLMTimeoutError(`LLM request exceeded total timeout of ${config.totalTimeoutMs}ms`);
        }
        try {
            return await operation(remainingTime);
        }
        catch (error) {
            lastError = error;
            const isRetryable = error instanceof LLMError &&
                error.retryable;
            const isLastAttempt = attempt ===
                config.maxAttempts;
            if (!isRetryable ||
                isLastAttempt) {
                throw error;
            }
            const backoff = calculateBackoff(attempt, config.baseDelayMs, config.maxDelayMs);
            const elapsedAfterFailure = Date.now() - startTime;
            const remainingAfterFailure = config.totalTimeoutMs -
                elapsedAfterFailure;
            if (remainingAfterFailure <=
                backoff) {
                throw new LLMTimeoutError("Not enough time remaining for retry");
            }
            config.onRetry?.(attempt, backoff, error);
            console.log(`Retrying attempt ${attempt + 1}/${config.maxAttempts} after ${backoff}ms`);
            await new Promise((resolve) => setTimeout(resolve, backoff));
        }
    }
    throw lastError;
}
