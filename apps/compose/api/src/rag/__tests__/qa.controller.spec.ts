import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { QAController, QARequestDto } from '../qa.controller';
import { QueryService } from '../query.service';
import { CollectionsService } from '../collections.service';
import { LLM_SERVICE } from '@/planes/llm';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';

describe('QAController', () => {
  let controller: QAController;
  let queryService: QueryService;
  let collectionsService: CollectionsService;
  let llmService: {
    generateResponse: jest.Mock;
    emitLlmObservabilityEvent: jest.Mock;
  };

  beforeEach(async () => {
    llmService = {
      generateResponse: jest.fn(),
      emitLlmObservabilityEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [QAController],
      providers: [
        {
          provide: QueryService,
          useValue: {
            queryCollection: jest.fn(),
          },
        },
        {
          provide: CollectionsService,
          useValue: {
            getCollection: jest.fn(),
          },
        },
        {
          provide: LLM_SERVICE,
          useValue: llmService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<QAController>(QAController);
    queryService = module.get<QueryService>(QueryService);
    collectionsService = module.get<CollectionsService>(CollectionsService);
  });

  const mockReq = { user: { id: 'user-1' } };
  const mockOrgSlug = 'test-org';

  it('returns answer with citations', async () => {
    (collectionsService.getCollection as jest.Mock).mockResolvedValue({
      id: 'col-1',
      name: 'Test Collection',
      allowedUsers: null,
    });

    (queryService.queryCollection as jest.Mock).mockResolvedValue({
      results: [
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          documentFilename: 'readme.md',
          content: 'This is the relevant content about topic X.',
          score: 0.85,
          pageNumber: null,
          chunkIndex: 0,
        },
      ],
      totalResults: 1,
      searchDurationMs: 50,
    });

    llmService.generateResponse.mockResolvedValue(
      'Based on the sources, topic X is about [Source 1: readme.md].',
    );

    const dto: QARequestDto = { question: 'What is topic X?' } as QARequestDto;

    const result = await controller.ask('col-1', dto, mockReq, mockOrgSlug);

    expect(result.answer).toContain('topic X');
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]!.documentFilename).toBe('readme.md');
    expect(result.query).toBe('What is topic X?');
    expect(result.model).toBe('gpt-4o');
    expect(result.searchDurationMs).toBe(50);
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns empty answer when no results found', async () => {
    (collectionsService.getCollection as jest.Mock).mockResolvedValue({
      id: 'col-1',
      name: 'Empty Collection',
      allowedUsers: null,
    });

    (queryService.queryCollection as jest.Mock).mockResolvedValue({
      results: [],
      totalResults: 0,
      searchDurationMs: 10,
    });

    const dto: QARequestDto = {
      question: 'No results question',
    } as QARequestDto;

    const result = await controller.ask('col-1', dto, mockReq, mockOrgSlug);

    expect(result.answer).toContain('could not find');
    expect(result.citations).toHaveLength(0);
    expect(llmService.generateResponse).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when user lacks access', async () => {
    (collectionsService.getCollection as jest.Mock).mockResolvedValue({
      id: 'col-1',
      name: 'Private Collection',
      createdBy: 'other-user',
      allowedUsers: ['other-user'],
    });

    const dto: QARequestDto = { question: 'Secret question' } as QARequestDto;

    await expect(
      controller.ask('col-1', dto, mockReq, mockOrgSlug),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows creator access even when allowedUsers is set', async () => {
    (collectionsService.getCollection as jest.Mock).mockResolvedValue({
      id: 'col-1',
      name: 'My Collection',
      createdBy: 'user-1',
      allowedUsers: ['user-2'],
    });

    (queryService.queryCollection as jest.Mock).mockResolvedValue({
      results: [],
      totalResults: 0,
      searchDurationMs: 5,
    });

    const dto: QARequestDto = { question: 'My question' } as QARequestDto;

    const result = await controller.ask('col-1', dto, mockReq, mockOrgSlug);
    expect(result.query).toBe('My question');
  });

  it('passes custom model and topK to LLM', async () => {
    (collectionsService.getCollection as jest.Mock).mockResolvedValue({
      id: 'col-1',
      name: 'Test',
      allowedUsers: null,
      embeddingModel: 'nomic-embed-text',
    });

    (queryService.queryCollection as jest.Mock).mockResolvedValue({
      results: [
        {
          chunkId: 'c1',
          documentId: 'd1',
          documentFilename: 'doc.pdf',
          content: 'Content',
          score: 0.9,
          pageNumber: 3,
          chunkIndex: 0,
        },
      ],
      totalResults: 1,
      searchDurationMs: 20,
    });

    llmService.generateResponse.mockResolvedValue('Answer');

    const dto = {
      question: 'Q',
      model: 'claude-sonnet-4',
      topK: 10,
    } as QARequestDto;

    const result = await controller.ask('col-1', dto, mockReq, mockOrgSlug);

    expect(result.model).toBe('claude-sonnet-4');
    expect(queryService.queryCollection).toHaveBeenCalledWith(
      'col-1',
      'test-org',
      expect.objectContaining({ topK: 10 }),
      'nomic-embed-text',
    );
  });
});
