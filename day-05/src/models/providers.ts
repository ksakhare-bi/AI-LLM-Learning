import { SimpleChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessage } from "@langchain/core/messages";
import { AIMessageChunk } from "@langchain/core/messages";
import { ChatGenerationChunk } from "@langchain/core/outputs";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { ChatOpenAI } from "@langchain/openai";

export interface MockChatModelOptions {
  modelName?: string;
  failAlways?: boolean;
  failTimes?: number;
  tokenDelayMs?: number;
  customResponder?: (prompt: string) => string;
}

export class MockChatModel extends SimpleChatModel {
  private readonly modelName: string;
  private readonly failAlways: boolean;
  private failTimes: number;
  private readonly tokenDelayMs: number;
  private readonly customResponder?: (prompt: string) => string;
  private invocationCount = 0;

  constructor(options: MockChatModelOptions = {}) {
    super({});
    this.modelName = options.modelName ?? "mock-gpt-4o";
    this.failAlways = options.failAlways ?? false;
    this.failTimes = options.failTimes ?? 0;
    this.tokenDelayMs = options.tokenDelayMs ?? 5;
    this.customResponder = options.customResponder;
  }

  _llmType(): string {
    return this.modelName;
  }

  getInvocationCount(): number {
    return this.invocationCount;
  }

  resetInvocationCount(): void {
    this.invocationCount = 0;
  }

  private checkFailure(): void {
    this.invocationCount++;
    if (this.failAlways) {
      throw new Error(`[MockChatModel:${this.modelName}] RateLimitError: 429 Too Many Requests - quota exceeded`);
    }
    if (this.failTimes > 0) {
      this.failTimes--;
      throw new Error(`[MockChatModel:${this.modelName}] SimulatedServiceUnavailable: 503 Backend overloaded`);
    }
  }

  async _call(messages: BaseMessage[], _options: this["ParsedCallOptions"], _runManager?: CallbackManagerForLLMRun): Promise<string> {
    this.checkFailure();
    const promptText = messages.map((m) => `${m._getType()}: ${m.content}`).join("\n");
    return this.generateResponse(promptText);
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    _options: this["ParsedCallOptions"],
    _runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    this.checkFailure();
    const promptText = messages.map((m) => `${m._getType()}: ${m.content}`).join("\n");
    const fullResponse = this.generateResponse(promptText);

    // Stream by tokens/words
    const words = fullResponse.split(" ");
    for (let i = 0; i < words.length; i++) {
      const token = i === words.length - 1 ? words[i] : words[i] + " ";
      if (this.tokenDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.tokenDelayMs));
      }
      yield new ChatGenerationChunk({
        message: new AIMessageChunk({ content: token }),
        text: token,
      });
    }
  }

  private generateResponse(prompt: string): string {
    if (this.customResponder) {
      return this.customResponder(prompt);
    }

    const lower = prompt.toLowerCase();

    // Check if JSON structured output is explicitly requested
    if (lower.includes("json") || lower.includes("structured")) {
      return this.generateStructuredResponse(lower);
    }

    // Grounded knowledge answers matching Day-03 corpus
    if (lower.includes("parental leave") || lower.includes("caregiver")) {
      return "Under enterprise policy [corp-handbook-2026-0], employees receive 26 weeks of fully paid parental leave for both primary and secondary caregivers. Formal written notice must be submitted to the direct manager at least 30 days prior to the leave date.";
    }

    if (lower.includes("rollover") || lower.includes("vacation") || lower.includes("carryover")) {
      return "Full-time staff receive 20 annual leave days. Under policy [corp-handbook-2026-1], a maximum of 5 unused days can be carried over into the following fiscal year. Any excess leave above 5 days is permanently forfeited on December 31st.";
    }

    if (lower.includes("remote work") || lower.includes("home office") || lower.includes("stipend") || lower.includes("wfh")) {
      return "Eligible employees may work remotely up to 3 days per week with quarterly manager approval. A one-time equipment subsidy of $750 is provided for desks, ergonomic chairs, and monitors [corp-handbook-2026-2].";
    }

    if (lower.includes("mfa") || lower.includes("err_auth_mfa_092") || lower.includes("leakage") || lower.includes("security")) {
      return "Hardware token MFA is mandatory for all personnel. Under standard [corp-handbook-2026-5], credentials must never be shared; any leakage triggers incident ERR_AUTH_MFA_092 with immediate credential revocation.";
    }

    if (lower.includes("travel") || lower.includes("per-diem") || lower.includes("2026") || lower.includes("reimbursement")) {
      return "Effective January 2026, the domestic business travel per-diem rate is updated to $95 per day [corp-handbook-2026-6]. The previous 2024 rate of $65 is deprecated. Receipts must be submitted within 14 calendar days.";
    }

    return "Based on the verified enterprise documentation, all policies have been cross-checked with primary section records.";
  }

  private generateStructuredResponse(lower: string): string {
    let summary = "Policy overview evaluated.";
    let answer = "Grounded policy answer based on enterprise records.";
    const citations: string[] = [];

    if (lower.includes("parental leave")) {
      summary = "Parental Leave Policy 2026";
      answer = "26 weeks fully paid leave with 30 days advance notice.";
      citations.push("corp-handbook-2026-0");
    } else if (lower.includes("remote") || lower.includes("wfh") || lower.includes("stipend")) {
      summary = "Home Office Equipment Subsidy";
      answer = "One-time $750 subsidy for ergonomic desks and monitors.";
      citations.push("corp-handbook-2026-2");
    } else if (lower.includes("travel") || lower.includes("per-diem")) {
      summary = "Travel Per-Diem Standard 2026";
      answer = "Domestic per-diem rate is $95/day; legacy $65 rate is deprecated.";
      citations.push("corp-handbook-2026-6");
    } else {
      summary = "Standard Policy Evaluation";
      answer = "Standard corporate procedure complies with 2026 guidelines.";
      citations.push("corp-handbook-2026-0");
    }

    return JSON.stringify({
      summary,
      answer,
      citations,
      confidence: 0.98,
    });
  }
}

export function createPrimaryAndFallbackModels(): {
  primaryModel: SimpleChatModel | ChatOpenAI;
  fallbackModel: SimpleChatModel | ChatOpenAI;
} {
  const apiKey = process.env.OPENAI_API_KEY;
  const isRealKey = apiKey && apiKey.startsWith("sk-") && !apiKey.includes("tesgtrgfhftgtg") && apiKey.length > 30;

  if (isRealKey) {
    const primaryModel = new ChatOpenAI({
      model: "gpt-4o",
      temperature: 0,
      maxRetries: 1,
    });
    const fallbackModel = new ChatOpenAI({
      model: "gpt-4o-mini",
      temperature: 0,
    });
    return { primaryModel, fallbackModel };
  }

  // Deterministic mock models for local testing & CI
  const primaryModel = new MockChatModel({
    modelName: "primary-gpt-4o-mock",
    tokenDelayMs: 2,
  });
  const fallbackModel = new MockChatModel({
    modelName: "fallback-gpt-4o-mini-mock",
    tokenDelayMs: 2,
  });

  return { primaryModel, fallbackModel };
}
