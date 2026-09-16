import type { RetrievalResult } from "../retrieval/types.js";

export interface ContextBudgetOptions {
  maxCharacters?: number;
  maxEstimatedTokens?: number;
  headerTemplate?: (result: RetrievalResult, index: number) => string;
}

export interface AssembledContext {
  formattedContext: string;
  totalCharacters: number;
  estimatedTokens: number;
  includedChunks: RetrievalResult[];
  droppedChunksCount: number;
}

export class ContextBudgetGuard {
  private readonly maxCharacters: number;

  constructor(options: ContextBudgetOptions = {}) {
    if (options.maxCharacters) {
      this.maxCharacters = options.maxCharacters;
    } else if (options.maxEstimatedTokens) {
      this.maxCharacters = options.maxEstimatedTokens * 4; // ~4 chars per token approximation
    } else {
      this.maxCharacters = 2000;
    }
  }

  packContext(results: RetrievalResult[]): AssembledContext {
    const includedChunks: RetrievalResult[] = [];
    const formattedBlocks: string[] = [];
    let currentLength = 0;
    let droppedCount = 0;

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      const header = `--- [Source: ${res.chunk.metadata.title || "Doc"} | Section: ${
        res.chunk.metadata.section || "General"
      } | ID: ${res.chunk.id}] ---`;
      const block = `${header}\n${res.chunk.content}\n`;

      if (currentLength + block.length <= this.maxCharacters) {
        formattedBlocks.push(block);
        includedChunks.push(res);
        currentLength += block.length;
      } else {
        droppedCount = results.length - i;
        break;
      }
    }

    const formattedContext = formattedBlocks.join("\n").trim();

    return {
      formattedContext,
      totalCharacters: formattedContext.length,
      estimatedTokens: Math.ceil(formattedContext.length / 4),
      includedChunks,
      droppedChunksCount: droppedCount,
    };
  }
}
