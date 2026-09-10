import type { LLMResponse } from "../types.js";
import type { CacheStats, LLMCache } from "./cache.interface.js";

interface CacheEntry {
  response: LLMResponse;
  expiresAt: number | null;
}

export class MemoryLLMCache implements LLMCache {
  private readonly store = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;

  constructor(private readonly defaultTtlMs: number = 1000 * 60 * 60) {} // Default 1 hour TTL

  async get(key: string): Promise<LLMResponse | null> {
    const entry = this.store.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    // Return a clone to avoid callers mutating cached responses
    return structuredClone(entry.response);
  }

  async set(key: string, response: LLMResponse, ttlMs?: number): Promise<void> {
    const ttl = ttlMs ?? this.defaultTtlMs;
    const expiresAt = ttl > 0 ? Date.now() + ttl : null;

    this.store.set(key, {
      response: structuredClone(response),
      expiresAt
    });
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  getStats(): CacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.store.size
    };
  }
}
