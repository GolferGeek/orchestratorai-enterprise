module.exports = {
  AzureKeyCredential: jest.fn().mockImplementation((key) => ({ key })),
};
