import type { RetrievalResult } from "./types.js";
import type { DocumentChunk } from "../ingestion/types.js";

/**
 * Reciprocal Rank Fusion (RRF)
 * Combines multiple ranked result lists using positional ranks rather than raw scores.
 * Formula: RRF(d) = Sum_{m in Models} [ 1 / (k + rank_m(d)) ]
 * Default constant k = 60 (standard TREC / enterprise default).
 */
export function reciprocalRankFusion(
  rankedLists: RetrievalResult[][],
  k: number = 60
): RetrievalResult[] {
  const scoreMap = new Map<
    string,
    { chunk: DocumentChunk; fusedScore: number }
  >();

  for (const list of rankedLists) {
    list.forEach((item, index) => {
      const rank = index + 1; // 1-based rank
      const rrfIncrement = 1 / (k + rank);

      const existing = scoreMap.get(item.chunk.id);
      if (existing) {
        existing.fusedScore += rrfIncrement;
      } else {
        scoreMap.set(item.chunk.id, {
          chunk: item.chunk,
          fusedScore: rrfIncrement,
        });
      }
    });
  }

  const fusedResults: RetrievalResult[] = Array.from(scoreMap.values()).map(
    (entry) => ({
      chunk: entry.chunk,
      score: entry.fusedScore,
      stage: "rrf_fusion",
    })
  );

  return fusedResults.sort((a, b) => b.score - a.score);
}

/**
 * Relative Score Fusion (Min-Max Normalization + Weighted Sum)
 * Normalizes scores in each result list to [0, 1] range before computing weighted sum.
 */
export function relativeScoreFusion(
  rankedLists: RetrievalResult[][],
  weights: number[] = []
): RetrievalResult[] {
  if (rankedLists.length === 0) return [];

  // Default equal weights if not specified
  const effectiveWeights =
    weights.length === rankedLists.length
      ? weights
      : rankedLists.map(() => 1 / rankedLists.length);

  const scoreMap = new Map<
    string,
    { chunk: DocumentChunk; weightedScore: number }
  >();

  rankedLists.forEach((list, listIndex) => {
    if (list.length === 0) return;

    const scores = list.map((r) => r.score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const weight = effectiveWeights[listIndex];

    list.forEach((item) => {
      const normalizedScore = max > min ? (item.score - min) / (max - min) : 1.0;
      const contribution = weight * normalizedScore;

      const existing = scoreMap.get(item.chunk.id);
      if (existing) {
        existing.weightedScore += contribution;
      } else {
        scoreMap.set(item.chunk.id, {
          chunk: item.chunk,
          weightedScore: contribution,
        });
      }
    });
  });

  const fusedResults: RetrievalResult[] = Array.from(scoreMap.values()).map(
    (entry) => ({
      chunk: entry.chunk,
      score: entry.weightedScore,
      stage: "relative_fusion",
    })
  );

  return fusedResults.sort((a, b) => b.score - a.score);
}
