import { LLMProviderError, LLMRateLimitError, LLMValidationError } from "../errors.js";
export class AnthropicProvider {
    name = "anthropic";
    apiKey;
    simulated;
    constructor(config = {}) {
        this.apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
        this.simulated = config.simulated ?? !this.apiKey;
    }
    async generate(request, signal) {
        if (this.simulated) {
            return this.generateSimulated(request, signal);
        }
        const systemMessage = request.messages.find((m) => m.role === "system")?.content;
        const userAndAssistant = request.messages
            .filter((m) => m.role !== "system")
            .map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content
        }));
        const payload = {
            model: request.model.startsWith("claude") ? request.model : "claude-3-5-sonnet-20240620",
            max_tokens: request.maxTokens ?? 1024,
            system: systemMessage,
            messages: userAndAssistant,
            temperature: request.temperature
        };
        try {
            const res = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": this.apiKey ?? "",
                    "anthropic-version": "2023-06-01"
                },
                body: JSON.stringify(payload),
                signal
            });
            if (!res.ok) {
                const errorText = await res.text().catch(() => "");
                if (res.status === 429) {
                    throw new LLMRateLimitError(`Anthropic rate limit exceeded: ${errorText}`);
                }
                if (res.status === 400 || res.status === 401 || res.status === 403) {
                    throw new LLMValidationError(`Anthropic client error (${res.status}): ${errorText}`);
                }
                throw new LLMProviderError(`Anthropic server error (${res.status}): ${errorText}`);
            }
            const data = await res.json();
            const text = data.content.map((c) => c.text).join("");
            return {
                id: data.id,
                model: data.model,
                content: text,
                usage: {
                    inputTokens: data.usage.input_tokens,
                    outputTokens: data.usage.output_tokens,
                    totalTokens: data.usage.input_tokens + data.usage.output_tokens
                },
                finishReason: data.stop_reason ?? "end_turn",
                providerName: this.name
            };
        }
        catch (err) {
            if (signal?.aborted) {
                throw new Error("Provider request aborted");
            }
            throw err;
        }
    }
    async generateSimulated(request, signal) {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, 35);
            signal?.addEventListener("abort", () => {
                clearTimeout(timer);
                reject(new Error("Provider request aborted"));
            });
        });
        return {
            id: `anthropic-sim-${crypto.randomUUID()}`,
            model: request.model,
            content: JSON.stringify({
                name: "Arthur Anthropic",
                email: "arthur@anthropic.com",
                company: "Anthropic PBC"
            }),
            usage: { inputTokens: 18, outputTokens: 28, totalTokens: 46 },
            finishReason: "end_turn",
            providerName: this.name
        };
    }
}
