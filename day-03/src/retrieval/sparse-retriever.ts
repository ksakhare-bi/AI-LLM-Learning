import type {
  DocumentChunk
} from "../ingestion/types.js";

import type {
  MetadataFilterOptions,
  RetrievalResult,
  Retriever
} from "./types.js";
import { matchesMetadataFilter } from "./dense-retriever.js";

export class BM25Retriever
  implements Retriever {

  private readonly k1 = 1.2;
  private readonly b = 0.75;

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

    const documentLengths =
      eligibleChunks.map(
        (chunk) =>
          this.tokenize(
            chunk.content
          ).length
      );

    const averageLength =
      documentLengths.length === 0
        ? 0
        : documentLengths.reduce(
            (sum, length) =>
              sum + length,
            0
          ) /
          documentLengths.length;

    const results =
      eligibleChunks.map(
        (chunk) => {

          const terms =
            this.tokenize(
              chunk.content
            );

          const score =
            this.scoreDocument(
              queryTerms,
              terms,
              averageLength,
              eligibleChunks
            );

          return {
            chunk,
            score,
            stage: "bm25"
          };
        }
      );

    return results
      .sort(
        (a, b) =>
          b.score - a.score
      )
      .slice(0, limit);
  }

  private scoreDocument(
    queryTerms: string[],
    documentTerms: string[],
    averageLength: number,
    corpus: DocumentChunk[]
  ): number {

    if (
      queryTerms.length === 0 ||
      documentTerms.length === 0 ||
      averageLength === 0
    ) {
      return 0;
    }

    const documentLength =
      documentTerms.length;

    const termFrequency =
      new Map<string, number>();

    for (
      const term of documentTerms
    ) {
      termFrequency.set(
        term,
        (termFrequency.get(term) ?? 0) + 1
      );
    }

    let score = 0;

    for (
      const term of new Set(queryTerms)
    ) {

      const tf =
        termFrequency.get(term) ?? 0;

      if (tf === 0) {
        continue;
      }

      const documentFrequency =
        corpus.filter(
          (chunk) =>
            this.tokenize(
              chunk.content
            ).includes(term)
        ).length;

      const totalDocuments =
        corpus.length;

      const idf =
        Math.log(
          1 +
          (
            totalDocuments -
            documentFrequency +
            0.5
          ) /
          (
            documentFrequency +
            0.5
          )
        );

      const normalizedTf =
        (
          tf * (this.k1 + 1)
        ) /
        (
          tf +
          this.k1 *
          (
            1 -
            this.b +
            this.b *
            (
              documentLength /
              averageLength
            )
          )
        );

      score +=
        idf * normalizedTf;
    }

    return score;
  }

  private tokenize(
    text: string
  ): string[] {

    return text
      .toLowerCase()
      .replace(
        /[^a-z0-9\s]/g,
        " "
      )
      .split(/\s+/)
      .filter(
        Boolean
      );
  }
}
