import type {
  LabeledQuery,
  RetrievalMetrics,
  SingleQueryEvalResult,
} from "./types.js";
import type { RetrievalResult } from "../retrieval/types.js";

/**
 * Recall@K: Fraction of relevant chunks present in the top K retrieved results.
 */
export function computeRecallAtK(
  retrievedIds: string[],
  relevantIds: string[],
  k: number
): number {
  if (relevantIds.length === 0) return 1.0;
  const topK = retrievedIds.slice(0, k);
  const hits = relevantIds.filter((id) => topK.includes(id)).length;
  return hits / relevantIds.length;
}

/**
 * Mean Reciprocal Rank (MRR): 1 / rank of the first relevant chunk found.
 */
export function computeMRR(
  retrievedIds: string[],
  relevantIds: string[]
): number {
  if (relevantIds.length === 0) return 1.0;
  for (let i = 0; i < retrievedIds.length; i++) {
    if (relevantIds.includes(retrievedIds[i])) {
      return 1 / (i + 1); // 1-based rank
    }
  }
  return 0.0;
}

/**
 * Normalized Discounted Cumulative Gain (nDCG@K)
 */
export function computeNDCGAtK(
  retrievedIds: string[],
  relevantIds: string[],
  k: number
): number {
  if (relevantIds.length === 0) return 1.0;
  const topK = retrievedIds.slice(0, k);

  let dcg = 0;
  for (let i = 0; i < topK.length; i++) {
    const isRel = relevantIds.includes(topK[i]) ? 1 : 0;
    if (isRel > 0) {
      dcg += (Math.pow(2, isRel) - 1) / Math.log2(i + 2); // i+2 for 1-based log2(rank+1)
    }
  }

  // Ideal DCG (all relevant items at the front)
  let idcg = 0;
  const maxHits = Math.min(relevantIds.length, k);
  for (let i = 0; i < maxHits; i++) {
    idcg += (Math.pow(2, 1) - 1) / Math.log2(i + 2);
  }

  return idcg === 0 ? 0 : dcg / idcg;
}

/**
 * Context Precision: Fraction of top K items that are relevant.
 */
export function computeContextPrecision(
  retrievedIds: string[],
  relevantIds: string[],
  k: number
): number {
  if (k === 0) return 0;
  const topK = retrievedIds.slice(0, k);
  const hits = topK.filter((id) => relevantIds.includes(id)).length;
  return hits / k;
}

export function evaluateRetrieval(
  retrieved: RetrievalResult[],
  labeled: LabeledQuery,
  k: number = 3
): SingleQueryEvalResult {
  const retrievedIds = retrieved.map((r) => r.chunk.id);
  const metrics: RetrievalMetrics = {
    recallAtK: computeRecallAtK(retrievedIds, labeled.relevantChunkIds, k),
    mrr: computeMRR(retrievedIds, labeled.relevantChunkIds),
    ndcgAtK: computeNDCGAtK(retrievedIds, labeled.relevantChunkIds, k),
    contextPrecision: computeContextPrecision(
      retrievedIds,
      labeled.relevantChunkIds,
      k
    ),
  };

  return {
    queryId: labeled.id,
    query: labeled.query,
    metrics,
    retrievedResults: retrieved.slice(0, k),
  };
}
