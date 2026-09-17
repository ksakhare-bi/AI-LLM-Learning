import { z } from "zod";
import { RunnableLambda } from "@langchain/core/runnables";
export const StructuredRAGResponseSchema = z.object({
    summary: z.string().min(5),
    answer: z.string().min(10),
    citations: z.array(z.string()).min(1),
    confidence: z.number().min(0).max(1),
});
export function extractJsonFromText(text) {
    const trimmed = text.trim();
    // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch) {
        return codeBlockMatch[1].trim();
    }
    // Find the first '{' and the last '}'
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
        return trimmed.slice(start, end + 1);
    }
    return trimmed;
}
export function repairMalformedJson(corrupted) {
    let cleaned = extractJsonSubstring(corrupted);
    // Fix common trailing comma before closing brace or bracket: ,} -> } or ,] -> ]
    cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");
    // Fix single quotes to double quotes around keys and values: 'foo' -> "foo"
    cleaned = cleaned.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');
    return cleaned;
}
function extractJsonSubstring(text) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
        return text.slice(start, end + 1);
    }
    return text;
}
export class RetryableStructuredParser {
    schema;
    options;
    constructor(schema, options = {}) {
        this.schema = schema;
        this.options = options;
    }
    toRunnable() {
        const maxRetries = this.options.maxRetries ?? 2;
        const repairModel = this.options.repairModel;
        return RunnableLambda.from(async (rawText) => {
            let currentText = rawText;
            let lastError = null;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    const jsonString = extractJsonFromText(currentText);
                    const parsed = JSON.parse(jsonString);
                    return this.schema.parse(parsed);
                }
                catch (err) {
                    lastError = err instanceof Error ? err : new Error(String(err));
                    // If first parse failed, try algorithmic JSON repair first
                    if (attempt === 0) {
                        try {
                            const repairedJson = repairMalformedJson(currentText);
                            const parsed = JSON.parse(repairedJson);
                            return this.schema.parse(parsed);
                        }
                        catch {
                            // Algorithmic repair didn't succeed, proceed to model repair if available
                        }
                    }
                    // If repair model is available and retries remain, prompt model to fix
                    if (repairModel && attempt < maxRetries) {
                        const repairPrompt = `The following output failed schema validation:
${currentText}

Validation error:
${lastError.message}

Please fix the formatting and return ONLY valid JSON matching this schema:
${JSON.stringify(this.schema.description ?? "Valid schema required")}`;
                        const fixResult = await repairModel.invoke(repairPrompt);
                        currentText = typeof fixResult.content === "string" ? fixResult.content : JSON.stringify(fixResult.content);
                    }
                }
            }
            throw new Error(`Failed to parse structured output after ${maxRetries} retries: ${lastError?.message}`);
        }).withConfig({ runName: "RetryableStructuredParserRunnable" });
    }
}
