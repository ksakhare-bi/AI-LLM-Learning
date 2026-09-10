export class LLMError extends Error {
    code;
    retryable;
    constructor(message, code, retryable) {
        super(message);
        this.code = code;
        this.retryable = retryable;
        this.name = "LLMError";
    }
}
export class LLMTimeoutError extends LLMError {
    constructor(message = "LLM request timed out") {
        super(message, "LLM_TIMEOUT", true);
        this.name = "LLMTimeoutError";
    }
}
export class LLMRateLimitError extends LLMError {
    constructor(message = "LLM provider rate limit exceeded") {
        super(message, "RATE_LIMIT", true);
        this.name = "LLMRateLimitError";
    }
}
export class LLMProviderError extends LLMError {
    constructor(message = "LLM provider temporarily unavailable", retryable = true) {
        super(message, "PROVIDER_ERROR", retryable);
        this.name = "LLMProviderError";
    }
}
export class LLMValidationError extends LLMError {
    constructor(message = "Invalid LLM request") {
        super(message, "VALIDATION_ERROR", false);
        this.name = "LLMValidationError";
    }
}
/**
 * Thrown when the LLM produces output that cannot be parsed as valid JSON syntax.
 * (e.g. conversational filler, missing brackets, truncated output)
 */
export class LLMInvalidJSONError extends LLMError {
    rawContent;
    causeError;
    constructor(message = "LLM returned invalid JSON syntax", rawContent, causeError) {
        super(message, "INVALID_JSON", true);
        this.rawContent = rawContent;
        this.causeError = causeError;
        this.name = "LLMInvalidJSONError";
    }
}
/**
 * Thrown when the LLM produces valid JSON, but the data does not conform to the expected Zod schema.
 * (e.g. missing required properties, wrong types, regex/email validation failures)
 */
export class LLMSchemaValidationError extends LLMError {
    issues;
    rawContent;
    parsedJson;
    constructor(message = "LLM output failed schema validation", issues = [], rawContent, parsedJson) {
        super(message, "SCHEMA_VALIDATION_ERROR", true);
        this.issues = issues;
        this.rawContent = rawContent;
        this.parsedJson = parsedJson;
        this.name = "LLMSchemaValidationError";
    }
}
