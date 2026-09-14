import type { LLMMessage } from "../../config/types.js";

export interface ShortTermBufferOptions {
  maxMessages?: number;
  maxTokens?: number;
  preserveSystemMessage?: boolean;
}

export class ShortTermMemoryBuffer {
  private messages: LLMMessage[] = [];
  private readonly maxMessages: number;
  private readonly maxTokens: number;
  private readonly preserveSystemMessage: boolean;
  private _overflowCount = 0;

  constructor(options: ShortTermBufferOptions = {}) {
    this.maxMessages = options.maxMessages ?? 10;
    this.maxTokens = options.maxTokens ?? 4000;
    this.preserveSystemMessage = options.preserveSystemMessage ?? true;
  }

  add(message: LLMMessage): void {
    this.messages.push(structuredClone(message));
    this.enforceLimits();
  }

  addAll(messages: LLMMessage[]): void {
    for (const msg of messages) {
      this.add(msg);
    }
  }

  getMessages(): LLMMessage[] {
    return this.messages.map(m => structuredClone(m));
  }

  get size(): number {
    return this.messages.length;
  }

  get overflowCount(): number {
    return this._overflowCount;
  }

  clear(): void {
    this.messages = [];
    this._overflowCount = 0;
  }

  private enforceLimits(): void {
    let systemMessage: LLMMessage | undefined;
    let nonSystemMessages = this.messages;

    if (this.preserveSystemMessage && this.messages.length > 0 && this.messages[0].role === "system") {
      systemMessage = this.messages[0];
      nonSystemMessages = this.messages.slice(1);
    }

    // Enforce max message count on non-system messages
    const effectiveLimit = systemMessage ? this.maxMessages - 1 : this.maxMessages;
    while (nonSystemMessages.length > effectiveLimit) {
      nonSystemMessages.shift();
      this._overflowCount++;
    }

    // Enforce approximate token limit (4 chars ~= 1 token heuristic)
    while (nonSystemMessages.length > 1 && this.estimateTokens([systemMessage, ...nonSystemMessages].filter(Boolean) as LLMMessage[]) > this.maxTokens) {
      nonSystemMessages.shift();
      this._overflowCount++;
    }

    this.messages = systemMessage ? [systemMessage, ...nonSystemMessages] : nonSystemMessages;
  }

  private estimateTokens(messages: LLMMessage[]): number {
    let charCount = 0;
    for (const msg of messages) {
      charCount += msg.content.length + (msg.name?.length ?? 0);
    }
    return Math.ceil(charCount / 4);
  }
}
