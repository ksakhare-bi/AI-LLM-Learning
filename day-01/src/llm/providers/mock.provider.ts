import type { LLMRequest, LLMResponse } from "../types.js";
import type { LLMProvider } from "./base.provider.js";

export class MockLLMProvider implements LLMProvider { 
  async generate(
    request: LLMRequest, 
    signal?: AbortSignal
  ): Promise<LLMResponse> {
  
    await new Promise<void>((resolve, reject) => {
  
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
