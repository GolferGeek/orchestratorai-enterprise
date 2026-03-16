// Mock for quick-lru
class QuickLRU {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 100;
    this._cache = new Map();
  }

  get(key) {
    return this._cache.get(key);
  }

  set(key, value) {
    if (this._cache.size >= this.maxSize) {
      const firstKey = this._cache.keys().next().value;
      this._cache.delete(firstKey);
    }
    this._cache.set(key, value);
    return this;
  }

  has(key) {
    return this._cache.has(key);
  }

  delete(key) {
    return this._cache.delete(key);
  }

  clear() {
    this._cache.clear();
  }

  get size() {
    return this._cache.size;
  }

  [Symbol.iterator]() {
    return this._cache[Symbol.iterator]();
  }
}

module.exports = QuickLRU;
module.exports.default = QuickLRU;
