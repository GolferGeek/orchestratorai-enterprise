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

const mockGenerateImages = jest.fn().mockResolvedValue({
  images: [{ imageBytes: Buffer.from('fake-image-data') }],
});

const mockGetGenerativeModel = jest.fn().mockReturnValue({
  generateContent: mockGenerateContent,
});

const mockGetImageGenerationModel = jest.fn().mockReturnValue({
  generateImages: mockGenerateImages,
});

const VertexAI = jest.fn().mockImplementation(() => ({
  getGenerativeModel: mockGetGenerativeModel,
  preview: {
    getImageGenerationModel: mockGetImageGenerationModel,
  },
}));

module.exports = { VertexAI };
