import type { RetrievalResult } from "../retrieval/types.js";

export interface LabeledQuery {
  id: string;
  query: string;
  relevantChunkIds: string[];
  idealOrder?: string[];
  category?: string;
  notes?: string;
}

export interface RetrievalMetrics {
  recallAtK: number;
  mrr: number;
  ndcgAtK: number;
  contextPrecision: number;
}

export interface GenerationEvalResult {
  faithfulness: number;
  answerRelevance: number;
  totalClaims: number;
  supportedClaimsCount: number;
  supportedClaims: string[];
  unsupportedClaims: string[];
}

export interface SingleQueryEvalResult {
  queryId: string;
  query: string;
  metrics: RetrievalMetrics;
  retrievedResults: RetrievalResult[];
}

export interface BenchmarkSummary {
  configName: string;
  k: number;
  queryCount: number;
  avgRecallAtK: number;
  avgMRR: number;
  avgNDCGAtK: number;
  avgContextPrecision: number;
  avgLatencyMs: number;
}
