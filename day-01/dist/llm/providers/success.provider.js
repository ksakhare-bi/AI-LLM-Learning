export class SuccessLLMProvider {
    async generate(request, _signal) {
        return {
            id: crypto.randomUUID(),
            model: request.model,
            content: JSON.stringify({
                name: "Fallback User",
                email: "fallback@example.com",
                company: "Fallback Corp"
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
