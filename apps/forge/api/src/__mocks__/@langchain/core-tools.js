// Mock for @langchain/core/tools — the real package uses deeply nested
// generics that trigger TS2589 (type instantiation excessively deep) in
// the ts-jest compilation phase. This mock provides minimal stubs so
// unit tests can import and test tool factories without type errors.

class DynamicStructuredTool {
  constructor(config) {
    this.name = config.name;
    this.description = config.description;
    this.schema = config.schema;
    this.func = config.func;
  }

  async invoke(input) {
    return this.func(input);
  }
}

module.exports = { DynamicStructuredTool };
module.exports.default = { DynamicStructuredTool };
