import type { DocumentChunk } from "../ingestion/types.js";
import type { RetrievalResult } from "./types.js";

export interface RerankerOptions {
  exactMatchBoost?: number;
  phraseMatchBoost?: number;
  sectionHeaderBoost?: number;
  proximityBoost?: number;
}

/**
 * Cross-Encoder Re-ranker Simulator
 * Evaluates deep semantic query-document interactions jointly:
 * 1. Full term coverage and density
 * 2. Bigram/trigram phrase preservation
 * 3. Section header/title contextual relevance
 * 4. Token proximity and condition alignment
 */
export class CrossEncoderReranker {
  private readonly exactMatchBoost: number;
  private readonly phraseMatchBoost: number;
  private readonly sectionHeaderBoost: number;
  private readonly proximityBoost: number;

  constructor(options: RerankerOptions = {}) {
    this.exactMatchBoost = options.exactMatchBoost ?? 0.25;
    this.phraseMatchBoost = options.phraseMatchBoost ?? 0.35;
    this.sectionHeaderBoost = options.sectionHeaderBoost ?? 0.2;
    this.proximityBoost = options.proximityBoost ?? 0.2;
  }

  rerank(
    query: string,
    candidates: RetrievalResult[],
    limit?: number
  ): RetrievalResult[] {
    const scored = candidates.map((candidate) => {
      const relevanceScore = this.scoreCrossInteraction(
        query,
        candidate.chunk
      );
      return {
        chunk: candidate.chunk,
        score: relevanceScore,
        stage: "cross_encoder_rerank",
      };
    });

    const sorted = scored.sort((a, b) => b.score - a.score);
    return limit !== undefined ? sorted.slice(0, limit) : sorted;
  }

  private scoreCrossInteraction(query: string, chunk: DocumentChunk): number {
    const cleanQuery = query.toLowerCase().trim();
    const cleanContent = chunk.content.toLowerCase();
    const cleanSection = (chunk.metadata.section || "").toLowerCase();
    const cleanTitle = (chunk.metadata.title || "").toLowerCase();

    const queryTokens = cleanQuery
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);

    if (queryTokens.length === 0) return 0;

    // 1. Term Coverage Ratio (How many query terms exist in the chunk)
    const matchedTokens = queryTokens.filter((token) =>
      cleanContent.includes(token)
    );
    const coverageScore = matchedTokens.length / queryTokens.length;

    // 2. Phrase Matching (Bigram co-occurrences in exact order)
    let phraseMatches = 0;
    let totalBigrams = 0;
    for (let i = 0; i < queryTokens.length - 1; i++) {
      totalBigrams++;
      const bigram = `${queryTokens[i]} ${queryTokens[i + 1]}`;
      if (cleanContent.includes(bigram)) {
        phraseMatches++;
      }
    }
    const phraseScore =
      totalBigrams > 0 ? (phraseMatches / totalBigrams) * this.phraseMatchBoost : 0;

    // 3. Section Header / Title Boost
    let sectionScore = 0;
    const headerTokens = `${cleanTitle} ${cleanSection}`;
    const headerHits = queryTokens.filter((t) => headerTokens.includes(t)).length;
    if (headerHits > 0) {
      sectionScore = (headerHits / queryTokens.length) * this.sectionHeaderBoost;
    }

    // 4. Exact Query Substring Bonus
    let exactScore = 0;
    if (cleanContent.includes(cleanQuery)) {
      exactScore = this.exactMatchBoost;
    }

    // 5. Keyword Proximity / Density Score
    let proximityScore = 0;
    if (matchedTokens.length >= 2) {
      const firstPos = cleanContent.indexOf(matchedTokens[0]);
      const lastPos = cleanContent.lastIndexOf(
        matchedTokens[matchedTokens.length - 1]
      );
      if (firstPos !== -1 && lastPos !== -1 && lastPos >= firstPos) {
        const span = lastPos - firstPos;
        // The tighter the span relative to content length, the higher the score
        if (span < 200) {
          proximityScore = this.proximityBoost * (1 - span / 200);
        }
      }
    }

    // Combined normalized relevance score
    const rawScore =
      coverageScore * 0.4 +
      phraseScore +
      sectionScore +
      exactScore +
      proximityScore;

    return Math.min(1.0, Math.max(0.0, rawScore));
  }
}
