const mockGenerateContent = jest.fn().mockResolvedValue({
  response: {
    candidates: [
      {
        content: { parts: [{ text: 'Vertex AI response' }] },
      },
    ],
    usageMetadata: {
      promptTokenCount: 12,
      candidatesTokenCount: 8,
      totalTokenCount: 20,
    },
  },
});

const mockGetGenerativeModel = jest.fn().mockReturnValue({
  generateContent: mockGenerateContent,
});

const VertexAI = jest.fn().mockImplementation(() => ({
  getGenerativeModel: mockGetGenerativeModel,
}));

module.exports = { VertexAI };
