import type { LLMRequest, LLMResponse } from "../types.js";
import type { LLMProvider } from "./base.provider.js";

export class ErrorLLMProvider implements LLMProvider {
  
  constructor(private readonly statusCode: number) {}

  async generate(_request: LLMRequest, _signal?: AbortSignal): Promise<LLMResponse> {
    
    const error = new Error(`Provider returned HTTP ${this.statusCode}`) as Error & {
      status: number;
    };

    error.status = this.statusCode;

    throw error;
  }
}
