import type {
  DocumentChunk
} from "../ingestion/types.js";

import type {
  MetadataFilterOptions,
  RetrievalResult,
  Retriever
} from "./types.js";

export function matchesMetadataFilter(
  chunk: DocumentChunk,
  filter?: MetadataFilterOptions
): boolean {
  if (!filter) return true;
  if (filter.section && chunk.metadata.section !== filter.section) return false;
  if (filter.minVersion !== undefined && (chunk.metadata.version ?? 1) < filter.minVersion) return false;
  if (filter.tag && !chunk.metadata.tags?.includes(filter.tag)) return false;
  if (filter.customFilter && !filter.customFilter(chunk.metadata)) return false;
  return true;
}

export class DenseRetriever
  implements Retriever {

  constructor(
    private readonly chunks: DocumentChunk[]
  ) {}

  search(
    query: string,
    limit: number,
    filter?: MetadataFilterOptions
  ): RetrievalResult[] {

    const eligibleChunks = filter
      ? this.chunks.filter((c) => matchesMetadataFilter(c, filter))
      : this.chunks;

    const queryTerms =
      this.tokenize(query);

    const results =
      eligibleChunks.map((chunk) => {

        const documentTerms =
          this.tokenize(chunk.content);

        const score =
          this.semanticSimilarity(
            queryTerms,
            documentTerms
          );

        return {
          chunk,
          score,
          stage: "dense"
        };
      });

    return results
      .sort(
        (a, b) =>
          b.score - a.score
      )
      .slice(0, limit);
  }

  private tokenize(
    text: string
  ): Set<string> {

    return new Set(
      text
        .toLowerCase()
        .replace(
          /[^a-z0-9\s]/g,
          " "
        )
        .split(/\s+/)
        .filter(
          Boolean
        )
    );
  }

  private semanticSimilarity(
    queryTerms: Set<string>,
    documentTerms: Set<string>
  ): number {

    if (
      queryTerms.size === 0 ||
      documentTerms.size === 0
    ) {
      return 0;
    }

    let intersection = 0;

    for (
      const term of queryTerms
    ) {
      if (
        documentTerms.has(term)
      ) {
        intersection++;
      }
    }

    const union =
      new Set([
        ...queryTerms,
        ...documentTerms
      ]).size;

    return intersection / union;
  }
}
