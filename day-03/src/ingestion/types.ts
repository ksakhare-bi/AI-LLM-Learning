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
