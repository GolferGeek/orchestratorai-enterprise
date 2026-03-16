// Mock for @azure/core-auth
module.exports = {
  AzureKeyCredential: jest.fn().mockImplementation((key) => ({ key })),
  isTokenCredential: jest.fn().mockReturnValue(false),
  isKeyCredential: jest.fn().mockReturnValue(false),
};
