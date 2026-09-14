import type { LLMMessage } from "../../config/types.js";

export interface CompactorOptions {
  thresholdCount?: number;
  keepRecent?: number;
  summarizeFn?: (messagesToCompact: LLMMessage[]) => Promise<string>;
}

export interface CompactionResult {
  compacted: boolean;
  originalCount: number;
  newCount: number;
  summaryText?: string;
  messages: LLMMessage[];
}

export class MemoryCompactor {
  private readonly thresholdCount: number;
  private readonly keepRecent: number;
  private readonly summarizeFn?: (messagesToCompact: LLMMessage[]) => Promise<string>;

  constructor(options: CompactorOptions = {}) {
    this.thresholdCount = options.thresholdCount ?? 8;
    this.keepRecent = options.keepRecent ?? 4;
    this.summarizeFn = options.summarizeFn;
  }

  async compact(messages: LLMMessage[]): Promise<CompactionResult> {
    if (messages.length <= this.thresholdCount) {
      return {
        compacted: false,
        originalCount: messages.length,
        newCount: messages.length,
        messages: structuredClone(messages)
      };
    }

    let systemMessage: LLMMessage | undefined;
    let pool = messages;

    if (messages.length > 0 && messages[0].role === "system") {
      systemMessage = messages[0];
      pool = messages.slice(1);
    }

    if (pool.length <= this.keepRecent) {
      return {
        compacted: false,
        originalCount: messages.length,
        newCount: messages.length,
        messages: structuredClone(messages)
      };
    }

    const splitIndex = pool.length - this.keepRecent;
    const toCompact = pool.slice(0, splitIndex);
    const recent = pool.slice(splitIndex);

    let summaryText: string;
    if (this.summarizeFn) {
      summaryText = await this.summarizeFn(toCompact);
    } else {
      summaryText = this.defaultSummarize(toCompact);
    }

    const summaryMessage: LLMMessage = {
      role: "system",
      content: `[CONVERSATION COMPACTED MEMORY SUMMARY]\n${summaryText}`
    };

    const compactedMessages: LLMMessage[] = [];
    if (systemMessage) {
      compactedMessages.push(structuredClone(systemMessage));
    }
    compactedMessages.push(summaryMessage);
    for (const msg of recent) {
      compactedMessages.push(structuredClone(msg));
    }

    return {
      compacted: true,
      originalCount: messages.length,
      newCount: compactedMessages.length,
      summaryText,
      messages: compactedMessages
    };
  }

  private defaultSummarize(messages: LLMMessage[]): string {
    const lines: string[] = [];
    let stepCount = 0;
    const actions: string[] = [];
    const facts: string[] = [];

    for (const msg of messages) {
      if (msg.role === "user") {
        lines.push(`User instructed: "${msg.content.slice(0, 100)}${msg.content.length > 100 ? "..." : ""}"`);
      } else if (msg.role === "tool") {
        try {
          const parsed = JSON.parse(msg.content);
          if (parsed.toolName) {
            actions.push(`Tool ${parsed.toolName}: ${parsed.success ? "success" : "failed"}`);
          }
        } catch {
          actions.push(`Tool result recorded (${msg.content.slice(0, 60)})`);
        }
      } else if (msg.role === "assistant") {
        stepCount++;
        facts.push(`Assistant step: "${msg.content.slice(0, 80)}${msg.content.length > 80 ? "..." : ""}"`);
      }
    }

    return [
      `- History: ${messages.length} previous conversation turns summarized.`,
      `- Progress: ${stepCount} intermediate reasoning steps completed.`,
      actions.length > 0 ? `- Tool Actions: ${actions.join(", ")}` : null,
      facts.length > 0 ? `- Key Insights: ${facts.slice(-3).join("; ")}` : null
    ]
      .filter(Boolean)
      .join("\n");
  }
}
