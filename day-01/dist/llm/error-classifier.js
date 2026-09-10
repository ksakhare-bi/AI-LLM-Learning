import { LLMError, LLMRateLimitError, LLMProviderError, LLMValidationError, LLMTimeoutError } from "./errors.js";
export function classifyLLMError(error) {
    if (error instanceof LLMError) {
        return error;
    }
    const providerError = error;
    const status = providerError?.status;
    if (status === 429) {
        return new LLMRateLimitError(providerError.message ??
            "LLM provider rate limit exceeded");
    }
    if (status === 400 ||
        status === 401 ||
        status === 403) {
        return new LLMValidationError(providerError.message ??
            "LLM provider rejected the request");
    }
    if (status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504) {
        return new LLMProviderError(providerError.message ??
            "LLM provider temporarily unavailable", true);
    }
    if (error instanceof Error) {
        // Circuit breaker tripping means this provider is down; request should retry/fallback
        if (error.message.includes("Circuit breaker is OPEN")) {
            return new LLMProviderError(error.message, true);
        }
        if (error.message.includes("aborted") ||
            error.message.includes("timed out") ||
            error.message.includes("timeout")) {
            return new LLMTimeoutError(error.message);
        }
        if (error.message.includes("ECONNRESET") ||
            error.message.includes("ETIMEDOUT") ||
            error.message.includes("fetch failed") ||
            error.message.includes("network")) {
            return new LLMProviderError(error.message, true);
        }
    }
    return new LLMProviderError(error instanceof Error
        ? error.message
        : "Unknown LLM provider error", false);
}
