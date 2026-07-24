import { EmbeddingModelRouter } from '../embedding-model-router';
import { OpenAIEmbeddingClient } from './openai-embedding.client';

describe('OpenAIEmbeddingClient', () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.OPENROUTER_API_KEY;
  const originalSiteUrl = process.env.OPENROUTER_SITE_URL;
  const originalSiteName = process.env.OPENROUTER_SITE_NAME;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    process.env.OPENROUTER_SITE_URL = 'https://example.test';
    process.env.OPENROUTER_SITE_NAME = 'Test';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }
    if (originalSiteUrl === undefined) {
      delete process.env.OPENROUTER_SITE_URL;
    } else {
      process.env.OPENROUTER_SITE_URL = originalSiteUrl;
    }
    if (originalSiteName === undefined) {
      delete process.env.OPENROUTER_SITE_NAME;
    } else {
      process.env.OPENROUTER_SITE_NAME = originalSiteName;
    }
    jest.restoreAllMocks();
  });

  it('requests the pgvector-compatible dimension count from OpenRouter', async () => {
    const embedding = Array.from({ length: 768 }, () => 0.25);
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ embedding, index: 0 }],
          usage: { prompt_tokens: 3, total_tokens: 3 },
        }),
        { status: 200 },
      ),
    );
    const client = new OpenAIEmbeddingClient(new EmbeddingModelRouter());

    const result = await client.embed('hello', 'text-embedding-3-small');

    expect(result.embedding).toHaveLength(768);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/embeddings',
      expect.objectContaining({
        body: JSON.stringify({
          model: 'openai/text-embedding-3-small',
          input: ['hello'],
          dimensions: 768,
        }),
      }),
    );
  });

  it('rejects a response whose dimensions cannot fit the RAG vector column', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              embedding: Array.from({ length: 1536 }, () => 0.25),
              index: 0,
            },
          ],
          usage: { prompt_tokens: 3, total_tokens: 3 },
        }),
        { status: 200 },
      ),
    );
    const client = new OpenAIEmbeddingClient(new EmbeddingModelRouter());

    await expect(
      client.embed('hello', 'text-embedding-3-small'),
    ).rejects.toThrow(
      "OpenRouter returned 1536 dimensions for 'text-embedding-3-small', expected 768",
    );
  });
});
