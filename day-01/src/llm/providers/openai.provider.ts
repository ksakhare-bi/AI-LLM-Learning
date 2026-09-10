import type { LLMRequest, LLMResponse } from "../types.js";
import type { LLMProvider } from "./base.provider.js";
import {
  LLMProviderError,
  LLMRateLimitError,
  LLMValidationError
} from "../errors.js";

export interface OpenAIProviderConfig {
  apiKey?: string;
  baseURL?: string;
  simulated?: boolean;
}

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly simulated: boolean;

  constructor(config: OpenAIProviderConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
    this.baseURL = config.baseURL ?? "https://api.openai.com/v1";
    this.simulated = config.simulated ?? !this.apiKey;
  }

  async generate(
    request: LLMRequest,
    signal?: AbortSignal
  ): Promise<LLMResponse> {
    if (this.simulated) {
      return this.generateSimulated(request, signal);
    }

    const payload = {
      model: request.model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
        name: m.name
      })),
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      tools: request.tools?.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }
      })),
      tool_choice: request.toolChoice
    };

    try {
      const res = await fetch(`${this.baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload),
        signal
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        if (res.status === 429) {
          throw new LLMRateLimitError(`OpenAI rate limit exceeded: ${errorText}`);
        }
        if (res.status === 400 || res.status === 401 || res.status === 403) {
          throw new LLMValidationError(`OpenAI client error (${res.status}): ${errorText}`);
        }
        throw new LLMProviderError(`OpenAI server error (${res.status}): ${errorText}`);
      }

      const data = await res.json() as {
        id: string;
        model: string;
        choices: Array<{
          message: {
            content: string | null;
            tool_calls?: Array<{
              id: string;
              function: { name: string; arguments: string };
            }>;
          };
          finish_reason: string;
        }>;
        usage?: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        };
      };

      const choice = data.choices[0];
      const toolCalls = choice?.message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments || "{}")
      }));

      return {
        id: data.id,
        model: data.model,
        content: choice?.message.content ?? "",
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? 10,
          outputTokens: data.usage?.completion_tokens ?? 20,
          totalTokens: data.usage?.total_tokens ?? 30
        },
        finishReason: choice?.finish_reason ?? "stop",
        toolCalls,
        providerName: this.name
      };
    } catch (err: unknown) {
      if (signal?.aborted) {
        throw new Error("Provider request aborted");
      }
      throw err;
    }
  }

  private async generateSimulated(
    request: LLMRequest,
    signal?: AbortSignal
  ): Promise<LLMResponse> {
    // Quick simulated latency (30ms)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 30);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("Provider request aborted"));
      });
    });

    const lastMsg = request.messages.at(-1)?.content ?? "";

    // If tools are provided and user prompt asks for tool, simulate a tool call
    if (request.tools && request.tools.length > 0 && lastMsg.toLowerCase().includes("customer")) {
      return {
        id: `openai-sim-${crypto.randomUUID()}`,
        model: request.model,
        content: "",
        usage: { inputTokens: 25, outputTokens: 15, totalTokens: 40 },
        finishReason: "tool_calls",
        toolCalls: [
          {
            id: `call_${crypto.randomUUID().slice(0, 8)}`,
            name: "get_customer",
            arguments: { customerId: "cust_123" }
          }
        ],
        providerName: this.name
      };
    }

    return {
      id: `openai-sim-${crypto.randomUUID()}`,
      model: request.model,
      content: JSON.stringify({
        name: "Alice OpenAI",
        email: "alice@openai.com",
        company: "OpenAI Corp"
      }),
      usage: { inputTokens: 15, outputTokens: 25, totalTokens: 40 },
      finishReason: "stop",
      providerName: this.name
    };
  }
}
