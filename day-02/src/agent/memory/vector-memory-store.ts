export interface MemoryEntry {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
  embedding: number[];
  createdAt: number;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

/**
 * Deterministic semantic embedding generator based on character & token n-gram
 * feature hashing with L2 unit-norm normalization.
 * Guarantees reproducible, offline vector representations with true cosine similarity.
 */
const STOP_WORDS = new Set([
  "the", "a", "an", "in", "on", "of", "to", "for", "is", "at", "by", "from",
  "with", "what", "does", "do", "did", "and", "or", "over", "their", "this", "that"
]);

export class DeterministicEmbedder implements EmbeddingProvider {
  private readonly dimensions: number;

  constructor(dimensions: number = 1024) {
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const vector = new Array(this.dimensions).fill(0);
    const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
    const rawWords = normalized.split(/\s+/).filter(w => w.length > 0 && !STOP_WORDS.has(w));
    const words = rawWords.map(w => this.stemWord(w));

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      // Unigram
      const h1 = Math.abs(this.hashString(word)) % this.dimensions;
      vector[h1] += 2.0;

      // Bigram
      if (i < words.length - 1) {
        const bigram = `${words[i]}_${words[i + 1]}`;
        const h2 = Math.abs(this.hashString(bigram)) % this.dimensions;
        vector[h2] += 3.0;
      }
    }

    // Normalize to unit length (L2 norm)
    let norm = 0;
    for (let i = 0; i < this.dimensions; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
      for (let i = 0; i < this.dimensions; i++) {
        vector[i] /= norm;
      }
    }

    return vector;
  }

  private stemWord(w: string): string {
    if (w.endsWith("ing") && w.length > 5) return w.slice(0, -3);
    if (w.endsWith("ed") && w.length > 4) return w.slice(0, -2);
    if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) return w.slice(0, -1);
    return w;
  }

  private hashString(str: string): number {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
}

export class VectorMemoryStore {
  private readonly entries = new Map<string, MemoryEntry>();
  private readonly embedder: EmbeddingProvider;

  constructor(embedder?: EmbeddingProvider) {
    this.embedder = embedder ?? new DeterministicEmbedder();
  }

  async store(id: string, content: string, metadata?: Record<string, unknown>): Promise<MemoryEntry> {
    const embedding = await this.embedder.embed(content);
    const entry: MemoryEntry = {
      id,
      content,
      metadata,
      embedding,
      createdAt: Date.now()
    };
    this.entries.set(id, entry);
    return entry;
  }

  async search(query: string, topK: number = 3, minScore: number = 0.1): Promise<MemorySearchResult[]> {
    const queryEmbedding = await this.embedder.embed(query);
    const results: MemorySearchResult[] = [];

    for (const entry of this.entries.values()) {
      const score = this.cosineSimilarity(queryEmbedding, entry.embedding);
      if (score >= minScore) {
        results.push({ entry, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  get(id: string): MemoryEntry | undefined {
    return this.entries.get(id);
  }

  delete(id: string): boolean {
    return this.entries.delete(id);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  getAll(): MemoryEntry[] {
    return Array.from(this.entries.values());
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;
    return dot / denominator;
  }
}
