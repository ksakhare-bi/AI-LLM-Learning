import type { DocumentChunk } from "../ingestion/types.js";
import type { RetrievalResult } from "../retrieval/types.js";

export interface FreshnessOptions {
  referenceDate?: Date;
  decayRatePerDay?: number; // lambda parameter
  maxAgeDays?: number; // TTL cutoff
}

export class FreshnessManager {
  private readonly referenceDate: Date;
  private readonly decayRatePerDay: number;
  private readonly maxAgeDays?: number;

  constructor(options: FreshnessOptions = {}) {
    this.referenceDate = options.referenceDate ?? new Date();
    this.decayRatePerDay = options.decayRatePerDay ?? 0.005;
    this.maxAgeDays = options.maxAgeDays;
  }

  /**
   * Applies exponential time decay to retrieval scores based on chunk timestamp.
   * DecayedScore = Score * exp(-decayRate * daysOld)
   */
  applyDecay(results: RetrievalResult[]): RetrievalResult[] {
    return results.map((res) => {
      const ts = res.chunk.metadata.timestamp;
      if (!ts) return res;

      const chunkDate = new Date(ts);
      const diffMs = this.referenceDate.getTime() - chunkDate.getTime();
      const daysOld = Math.max(0, diffMs / (1000 * 60 * 60 * 24));

      if (this.maxAgeDays && daysOld > this.maxAgeDays) {
        return {
          ...res,
          score: 0,
          stage: "freshness_expired",
        };
      }

      const multiplier = Math.exp(-this.decayRatePerDay * daysOld);
      return {
        ...res,
        score: res.score * multiplier,
        stage: "freshness_decayed",
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Deduplicates chunks by documentId / section to only keep the latest version.
   */
  filterLatestVersions(chunks: DocumentChunk[]): DocumentChunk[] {
    const latestVersionMap = new Map<string, DocumentChunk>();

    for (const chunk of chunks) {
      const key = `${chunk.documentId}:${chunk.metadata.section}:${chunk.metadata.chunkIndex}`;
      const existing = latestVersionMap.get(key);

      const currentVersion = (chunk.metadata.version as number) ?? 1;
      const existingVersion = (existing?.metadata.version as number) ?? 0;

      if (!existing || currentVersion > existingVersion) {
        latestVersionMap.set(key, chunk);
      }
    }

    return Array.from(latestVersionMap.values());
  }
}
