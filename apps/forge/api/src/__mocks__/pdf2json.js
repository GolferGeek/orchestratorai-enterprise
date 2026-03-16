// Mock for pdf2json — the real package is an optional runtime dependency
// that may not be installed in all environments. Tests mock this at the
// jest.mock() level; this file prevents module-not-found errors during
// module resolution in the Jest transform phase.

class PDFParser {
  constructor() {}
  on() {}
  parseBuffer() {}
}

module.exports = PDFParser;
module.exports.default = PDFParser;
