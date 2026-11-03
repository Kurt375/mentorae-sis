/**
 * High-Performance In-Memory Cache (Zero External Dependencies)
 * Mentorae SIS - Eliminates repetitive TiDB Serverless reads (0 RUs on cache hit).
 */

class MemoryCache {
  constructor() {
    this.store = new Map();
    // Periodically prune expired entries every 60 seconds
    this.cleanupTimer = setInterval(() => this.prune(), 60000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  /**
   * Get an item from the cache.
   * @param {string} key
   * @returns {any|null}
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * Set an item with a time-to-live (TTL).
   * @param {string} key
   * @param {any} value
   * @param {number} ttlSeconds - Duration in seconds (default: 300 = 5 minutes)
   */
  set(key, value, ttlSeconds = 300) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  /**
   * Delete an item by key.
   * @param {string} key
   */
  del(key) {
    this.store.delete(key);
  }

  /**
   * Delete all keys starting with a given prefix (useful for invalidating namespaces).
   * @param {string} prefix
   */
  delByPrefix(prefix) {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Clear all cached data.
   */
  flush() {
    this.store.clear();
  }

  /**
   * Prune expired keys.
   */
  prune() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}

const cache = new MemoryCache();
module.exports = cache;

