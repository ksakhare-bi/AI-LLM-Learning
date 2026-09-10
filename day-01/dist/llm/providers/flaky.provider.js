import { LLMProviderError } from "../errors.js";
export class FlakyLLMProvider {
    attempts = 0;
    async generate(request, _signal) {
        this.attempts++;
        console.log(`Provider attempt: ${this.attempts}`);
        if (this.attempts < 3) {
            throw new LLMProviderError("Temporary provider failure");
        }
        return {
            id: crypto.randomUUID(),
            model: request.model,
            content: JSON.stringify({
                name: "John Doe",
                email: "john@example.com",
                company: "Acme"
            }),
            usage: {
                inputTokens: 10,
                outputTokens: 20,
                totalTokens: 30
            },
            finishReason: "stop"
        };
    }
}
