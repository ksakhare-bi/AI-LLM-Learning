import type {
  MetadataFilterOptions,
  RetrievalResult,
  Retriever,
} from "./types.js";
import { CrossEncoderReranker } from "./reranker.js";

export interface TwoStageRetrieverOptions {
  stage1Limit?: number;
  reranker?: CrossEncoderReranker;
}

/**
 * Two-Stage Retriever:
 * Stage 1: High-recall broad search (e.g. Hybrid Dense + BM25)
 * Stage 2: High-precision Cross-Encoder Re-ranking on the candidate pool
 */
export class TwoStageRetriever implements Retriever {
  private readonly stage1Limit: number;
  private readonly reranker: CrossEncoderReranker;

  constructor(
    private readonly stage1Retriever: Retriever,
    options: TwoStageRetrieverOptions = {}
  ) {
    this.stage1Limit = options.stage1Limit ?? 20;
    this.reranker = options.reranker ?? new CrossEncoderReranker();
  }

  search(
    query: string,
    limit: number,
    filter?: MetadataFilterOptions
  ): RetrievalResult[] {
    // 1. Broad recall fetch
    const candidates = this.stage1Retriever.search(
      query,
      this.stage1Limit,
      filter
    );

    // 2. High-precision cross-encoder re-ranking
    return this.reranker.rerank(query, candidates, limit);
  }
}
