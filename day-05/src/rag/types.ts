export interface DocumentSection {
  heading: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface SourceDocument {
  id: string;
  title: string;
  sections: DocumentSection[];
  metadata?: Record<string, unknown>;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  metadata: {
    title: string;
    section: string;
    chunkIndex: number;
    timestamp?: string;
    version?: number;
    tags?: string[];
    [key: string]: unknown;
  };
}

export interface RetrievalResult {
  chunk: DocumentChunk;
  score: number;
  stage?: string;
}

export interface CitationSource {
  id: string;
  title: string;
  section: string;
  snippet: string;
  relevanceScore: number;
}

export interface RAGChainInput {
  query: string;
  topK?: number;
  filter?: {
    section?: string;
    minVersion?: number;
  };
}

export interface RAGChainOutput {
  answer: string;
  sources: CitationSource[];
  metrics: {
    totalDurationMs: number;
    retrievalDurationMs: number;
    generationDurationMs: number;
    retrievedCount: number;
    usedFallback: boolean;
  };
}

export interface LabeledEvaluationQuery {
  id: string;
  query: string;
  relevantChunkIds: string[];
  notes: string;
}

export interface BenchmarkMetrics {
  recallAtK: number;
  mrr: number;
  ndcgAtK: number;
  contextPrecision: number;
}
