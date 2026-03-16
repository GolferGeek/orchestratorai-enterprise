// Mock for @azure-rest/ai-inference
module.exports = {
  default: jest.fn().mockReturnValue({
    path: jest.fn().mockReturnValue({
      post: jest.fn().mockResolvedValue({
        status: '200',
        body: { choices: [] },
      }),
    }),
  }),
};
