import { LLMProviderError, LLMRateLimitError, LLMValidationError } from "../errors.js";
export class GeminiProvider {
    name = "gemini";
    apiKey;
    simulated;
    constructor(config = {}) {
        this.apiKey = config.apiKey ?? process.env.GEMINI_API_KEY;
        this.simulated = config.simulated ?? !this.apiKey;
    }
    async generate(request, signal) {
        if (this.simulated) {
            return this.generateSimulated(request, signal);
        }
        const modelName = request.model.startsWith("gemini") ? request.model : "gemini-1.5-flash";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.apiKey}`;
        const contents = request.messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
        }));
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents }),
                signal
            });
            if (!res.ok) {
                const errorText = await res.text().catch(() => "");
                if (res.status === 429) {
                    throw new LLMRateLimitError(`Gemini rate limit exceeded: ${errorText}`);
                }
                if (res.status === 400 || res.status === 403) {
                    throw new LLMValidationError(`Gemini client error (${res.status}): ${errorText}`);
                }
                throw new LLMProviderError(`Gemini server error (${res.status}): ${errorText}`);
            }
            const data = await res.json();
            const candidate = data.candidates?.[0];
            const text = candidate?.content?.parts?.[0]?.text ?? "";
            return {
                id: `gemini-${crypto.randomUUID()}`,
                model: request.model,
                content: text,
                usage: {
                    inputTokens: data.usageMetadata?.promptTokenCount ?? 12,
                    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 18,
                    totalTokens: data.usageMetadata?.totalTokenCount ?? 30
                },
                finishReason: candidate?.finishReason ?? "STOP",
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
            const timer = setTimeout(resolve, 25);
            signal?.addEventListener("abort", () => {
                clearTimeout(timer);
                reject(new Error("Provider request aborted"));
            });
        });
        return {
            id: `gemini-sim-${crypto.randomUUID()}`,
            model: request.model,
            content: JSON.stringify({
                name: "Gary Gemini",
                email: "gary@gemini.google.com",
                company: "Google Gemini LLC"
            }),
            usage: { inputTokens: 14, outputTokens: 22, totalTokens: 36 },
            finishReason: "STOP",
            providerName: this.name
        };
    }
}
