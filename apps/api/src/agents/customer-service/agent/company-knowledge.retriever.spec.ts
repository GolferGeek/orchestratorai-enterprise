import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { CompanyKnowledgeRetriever } from './company-knowledge.retriever';

describe('CompanyKnowledgeRetriever', () => {
  const context = Object.freeze(
    createMockExecutionContext({ orgSlug: 'acme', userId: 'guest-1' }),
  );
  const collections = { getCollections: jest.fn() };
  const queries = {
    queryCollection: jest.fn(),
    queryByComplexity: jest.fn(),
  };
  let retriever: CompanyKnowledgeRetriever;

  const collection = {
    id: 'col-1',
    slug: 'company-knowledge',
    embeddingModel: 'nomic-embed-text',
    complexityType: 'basic',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    retriever = new CompanyKnowledgeRetriever(
      collections as never,
      queries as never,
    );
  });

  it('throws a configuration error when the org has no company-knowledge collection', async () => {
    collections.getCollections.mockResolvedValue([
      { ...collection, slug: 'something-else' },
    ]);

    await expect(retriever.retrieve(context, 'hours?')).rejects.toThrow(
      "Organization 'acme' has no 'company-knowledge' RAG collection",
    );
    expect(collections.getCollections).toHaveBeenCalledWith('acme', 'guest-1');
    expect(queries.queryCollection).not.toHaveBeenCalled();
  });

  it('returns no excerpts when the collection has nothing on the question', async () => {
    collections.getCollections.mockResolvedValue([collection]);
    queries.queryCollection.mockResolvedValue({ results: [] });

    await expect(retriever.retrieve(context, 'hours?')).resolves.toEqual([]);
  });

  it('queries the collection with its embedding model and maps the results', async () => {
    collections.getCollections.mockResolvedValue([collection]);
    queries.queryCollection.mockResolvedValue({
      results: [
        {
          documentFilename: 'price-list.md',
          sectionPath: 'Antibodies',
          content: 'Anti-GFAP: $250',
          score: 0.8,
        },
        { documentFilename: 'about.md', content: 'Open 9-5', score: 0.6 },
      ],
    });

    const excerpts = await retriever.retrieve(context, 'price of GFAP?');

    expect(queries.queryCollection).toHaveBeenCalledWith(
      'col-1',
      'acme',
      expect.objectContaining({
        query: 'price of GFAP?',
        topK: 5,
        similarityThreshold: 0.3,
        strategy: 'basic',
      }),
      'nomic-embed-text',
    );
    expect(excerpts).toEqual([
      { documentName: 'price-list.md', section: 'Antibodies', content: 'Anti-GFAP: $250' },
      { documentName: 'about.md', content: 'Open 9-5' },
    ]);
  });

  it('uses complexity search when the collection has a complexity type', async () => {
    collections.getCollections.mockResolvedValue([
      { ...collection, complexityType: 'hybrid' },
    ]);
    queries.queryByComplexity.mockResolvedValue({ results: [] });

    await retriever.retrieve(context, 'hours?');

    expect(queries.queryByComplexity).toHaveBeenCalledWith(
      'col-1',
      'acme',
      'hybrid',
      expect.objectContaining({ query: 'hours?', topK: 5 }),
      'nomic-embed-text',
    );
    expect(queries.queryCollection).not.toHaveBeenCalled();
  });
});
