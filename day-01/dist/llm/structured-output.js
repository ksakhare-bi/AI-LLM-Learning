import { LLMInvalidJSONError, LLMSchemaValidationError } from "./errors.js";
/**
 * Extracts JSON from LLM text, stripping markdown code blocks if present
 */
export function extractJsonString(content) {
    const trimmed = content.trim();
    // Handle markdown code fences (```json ... ``` or ``` ...)
    const markdownMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (markdownMatch && markdownMatch[1]) {
        return markdownMatch[1].trim();
    }
    // Handle conversational prefix if braces exist
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        return trimmed.slice(firstBrace, lastBrace + 1);
    }
    const firstBracket = trimmed.indexOf("[");
    const lastBracket = trimmed.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        return trimmed.slice(firstBracket, lastBracket + 1);
    }
    return trimmed;
}
/**
 * Production-grade two-phase structured output parser:
 * Phase 1: Syntactic parsing (JSON syntax) -> throws typed LLMInvalidJSONError
 * Phase 2: Semantic validation (Zod schema) -> throws typed LLMSchemaValidationError
 */
export async function parseStructuredOutput(content, schema) {
    const cleanJson = extractJsonString(content);
    let parsedJson;
    // Phase 1: JSON Syntax Verification
    try {
        parsedJson = JSON.parse(cleanJson);
    }
    catch (err) {
        throw new LLMInvalidJSONError(`LLM returned invalid JSON syntax: ${err instanceof Error ? err.message : String(err)}`, content, err instanceof Error ? err : undefined);
    }
    // Phase 2: Schema / Contract Verification
    const result = schema.safeParse(parsedJson);
    if (!result.success) {
        const errorDetails = result.error.issues
            .map((i) => `[${i.path.join(".") || "root"}]: ${i.message}`)
            .join("; ");
        throw new LLMSchemaValidationError(`LLM output failed schema validation: ${errorDetails}`, result.error.issues, content, parsedJson);
    }
    return result.data;
}
