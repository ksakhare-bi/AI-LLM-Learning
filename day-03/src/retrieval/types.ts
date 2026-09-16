import type { DocumentChunk } from "../ingestion/types.js";

export interface RetrievalResult {
  chunk: DocumentChunk;
  score: number;
  stage?: string;
}

export type MetadataFilter = (metadata: DocumentChunk["metadata"]) => boolean;

export interface MetadataFilterOptions {
  section?: string;
  minVersion?: number;
  tag?: string;
  customFilter?: MetadataFilter;
}

export interface Retriever {
  search(
    query: string,
    limit: number,
    filter?: MetadataFilterOptions
  ): RetrievalResult[];
}

export type ScoreFusionMethod = "rrf" | "relative";
