import type { LLMResponse } from "../types.js";

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

export interface LLMCache {
  get(key: string): Promise<LLMResponse | null>;
  set(key: string, response: LLMResponse, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  getStats(): CacheStats;
}
