export class MockLLMProvider {
    async generate(request, signal) {
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                resolve();
            }, 5000);
            signal?.addEventListener("abort", () => {
                clearTimeout(timeout);
                reject(new Error("Provider request aborted"));
            });
        });
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
