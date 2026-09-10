import { z } from "zod";
import { LLMClient } from "../client.js";
/**
 * Zod schema defining the expected structured evaluation verdict from the Judge LLM
 */
export const JudgeVerdictSchema = z.object({
    score: z.number().min(0).max(1),
    passed: z.boolean(),
    reason: z.string().default("")
});
export const DEFAULT_JUDGE_SYSTEM_PROMPT = `You are an expert, impartial evaluation judge.
Your task is to evaluate an AI model's output based on a reference input or expected output, according to a specified evaluation criteria.

You must evaluate thoroughly and return a valid JSON object matching this schema:
{
  "score": <number between 0.0 and 1.0 representing quality / adherence>,
  "passed": <boolean: true if acceptable and meets criteria, false otherwise>,
  "reason": "<concise justification explaining your score and verdict>"
}`;
export const DEFAULT_JUDGE_CRITERIA = "Evaluate whether the actual output accurately, truthfully, and completely satisfies the task requirements and matches the expected reference without hallucinations, errors, or contradictions.";
export function defaultJudgePromptBuilder(reference, actual, criteria) {
    const refStr = typeof reference === "object"
        ? JSON.stringify(reference, null, 2)
        : String(reference ?? "None provided");
    const actStr = typeof actual === "object"
        ? JSON.stringify(actual, null, 2)
        : String(actual ?? "");
    return `[Evaluation Criteria]
${criteria}

[Reference / Expected Output]
${refStr}

[Actual Model Output Under Evaluation]
${actStr}

Evaluate the actual model output against the reference and criteria. Return your verdict as a JSON object.`;
}
/**
 * Deterministic Mock Judge Provider for CI and unit tests without external API dependencies
 */
export class MockJudgeLLMProvider {
    verdict;
    name = "mock-judge";
    constructor(verdict = {
        score: 1.0,
        passed: true,
        reason: "Output accurately satisfies all evaluation criteria."
    }) {
        this.verdict = verdict;
    }
    async generate(request) {
        return {
            id: `judge-${crypto.randomUUID()}`,
            model: request.model,
            content: JSON.stringify(this.verdict),
            usage: {
                inputTokens: 50,
                outputTokens: 25,
                totalTokens: 75
            },
            finishReason: "stop",
            providerName: this.name
        };
    }
}
/**
 * LLM-as-a-Judge Evaluator
 * Uses an LLM to evaluate complex, semantic, and open-ended model outputs
 * against reference data and specified criteria, returning a normalized score and verdict.
 */
export class LLMAsJudgeEvaluator {
    name = "llm-as-judge";
    client;
    model;
    criteria;
    passThreshold;
    systemPrompt;
    buildPrompt;
    constructor(config) {
        if (config.client) {
            this.client = config.client;
        }
        else if (config.provider) {
            this.client = new LLMClient(config.provider);
        }
        else {
            throw new Error("LLMAsJudgeEvaluator requires either a 'client' or a 'provider' in its configuration.");
        }
        this.model = config.model ?? "demo-model";
        this.criteria = config.criteria ?? DEFAULT_JUDGE_CRITERIA;
        this.passThreshold = config.passThreshold ?? 0.7;
        this.systemPrompt = config.systemPrompt ?? DEFAULT_JUDGE_SYSTEM_PROMPT;
        this.buildPrompt = config.buildPrompt ?? defaultJudgePromptBuilder;
    }
    async evaluate(expectedOrInput, actualOutput) {
        try {
            const userPrompt = this.buildPrompt(expectedOrInput, actualOutput, this.criteria);
            const verdict = await this.client.generateStructured({
                model: this.model,
                messages: [
                    { role: "system", content: this.systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                temperature: 0.0
            }, JudgeVerdictSchema);
            const passed = verdict.score >= this.passThreshold && verdict.passed;
            return {
                passed,
                score: verdict.score,
                reason: verdict.reason,
                metadata: {
                    judgeModel: this.model,
                    criteria: this.criteria,
                    verdictPassed: verdict.passed,
                    passThreshold: this.passThreshold
                }
            };
        }
        catch (err) {
            return {
                passed: false,
                score: 0.0,
                reason: `LLM-as-judge evaluation failed: ${err instanceof Error ? err.message : String(err)}`
            };
        }
    }
}
