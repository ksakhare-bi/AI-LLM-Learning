export class MemoryLLMCache {
    defaultTtlMs;
    store = new Map();
    hits = 0;
    misses = 0;
    constructor(defaultTtlMs = 1000 * 60 * 60) {
        this.defaultTtlMs = defaultTtlMs;
    } // Default 1 hour TTL
    async get(key) {
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
    async set(key, response, ttlMs) {
        const ttl = ttlMs ?? this.defaultTtlMs;
        const expiresAt = ttl > 0 ? Date.now() + ttl : null;
        this.store.set(key, {
            response: structuredClone(response),
            expiresAt
        });
    }
    async delete(key) {
        return this.store.delete(key);
    }
    async clear() {
        this.store.clear();
        this.hits = 0;
        this.misses = 0;
    }
    getStats() {
        return {
            hits: this.hits,
            misses: this.misses,
            size: this.store.size
        };
    }
}
