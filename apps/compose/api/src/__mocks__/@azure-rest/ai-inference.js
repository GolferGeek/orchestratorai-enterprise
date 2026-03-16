const mockPost = jest.fn().mockResolvedValue({
  body: {
    choices: [{ message: { content: 'Azure response' } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  },
});

const mockPath = jest.fn().mockReturnValue({ post: mockPost });

const ModelClient = jest.fn().mockReturnValue({ path: mockPath });

module.exports = {
  default: ModelClient,
  isUnexpected: jest.fn().mockReturnValue(false),
};
