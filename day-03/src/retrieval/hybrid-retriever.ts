import type {
  MetadataFilterOptions,
  RetrievalResult,
  Retriever,
  ScoreFusionMethod,
} from "./types.js";
import { reciprocalRankFusion, relativeScoreFusion } from "./score-fusion.js";

export interface HybridRetrieverOptions {
  fusionMethod?: ScoreFusionMethod;
  candidatePoolSize?: number;
  rrfConstant?: number;
  weights?: [number, number]; // [denseWeight, sparseWeight]
}

export class HybridRetriever implements Retriever {
  private readonly fusionMethod: ScoreFusionMethod;
  private readonly candidatePoolSize: number;
  private readonly rrfConstant: number;
  private readonly weights: [number, number];

  constructor(
    private readonly denseRetriever: Retriever,
    private readonly sparseRetriever: Retriever,
    options: HybridRetrieverOptions = {}
  ) {
    this.fusionMethod = options.fusionMethod ?? "rrf";
    this.candidatePoolSize = options.candidatePoolSize ?? 20;
    this.rrfConstant = options.rrfConstant ?? 60;
    this.weights = options.weights ?? [0.5, 0.5];
  }

  search(
    query: string,
    limit: number,
    filter?: MetadataFilterOptions
  ): RetrievalResult[] {
    const denseCandidates = this.denseRetriever.search(
      query,
      this.candidatePoolSize,
      filter
    );
    const sparseCandidates = this.sparseRetriever.search(
      query,
      this.candidatePoolSize,
      filter
    );

    let fused: RetrievalResult[];
    if (this.fusionMethod === "rrf") {
      fused = reciprocalRankFusion(
        [denseCandidates, sparseCandidates],
        this.rrfConstant
      );
    } else {
      fused = relativeScoreFusion(
        [denseCandidates, sparseCandidates],
        this.weights
      );
    }

    return fused.slice(0, limit).map((res) => ({
      ...res,
      stage: `hybrid_${this.fusionMethod}`,
    }));
  }
}
