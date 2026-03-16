// Mock implementation of quick-lru for Jest tests
class QuickLRU extends Map {
  constructor(options = {}) {
    super();
    this.maxSize = options.maxSize || Infinity;
  }

  set(key, value) {
    if (this.size >= this.maxSize && !this.has(key)) {
      const firstKey = this.keys().next().value;
      this.delete(firstKey);
    }
    return super.set(key, value);
  }
}

module.exports = QuickLRU;
module.exports.default = QuickLRU;
