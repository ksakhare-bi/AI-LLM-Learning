import type {
  LLMRequest,
  LLMResponse
} from "../types.js";

import type {
  LLMProvider
} from "./base.provider.js";

export class SuccessLLMProvider
  implements LLMProvider
{
  async generate(
    request: LLMRequest,
    _signal?: AbortSignal
  ): Promise<LLMResponse> {
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