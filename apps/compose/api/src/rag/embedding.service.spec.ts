import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmbeddingService } from './embedding.service';
import { EMBEDDING_SERVICE, EmbeddingServiceProvider } from '../rag-storage';

describe('EmbeddingService (wrapper)', () => {
  let service: EmbeddingService;
  let mockProvider: jest.Mocked<EmbeddingServiceProvider>;

  const mockEmbedding = Array(768).fill(0.1);

  beforeEach(async () => {
    mockProvider = {
      embed: jest.fn().mockResolvedValue(mockEmbedding),
      embedBatch: jest
        .fn()
        .mockResolvedValue([{ embedding: mockEmbedding, tokenCount: 5 }]),
      embedWithTokenCount: jest.fn().mockResolvedValue({
        embedding: mockEmbedding,
        tokenCount: 5,
      }),
      getDimensions: jest.fn().mockReturnValue(768),
      getRecommendedThreshold: jest.fn().mockReturnValue(0.6),
      checkHealth: jest.fn().mockResolvedValue({
        status: 'ok',
        message: 'healthy',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'EMBEDDING_MODEL') return 'nomic-embed-text';
              return undefined;
            }),
          },
        },
        {
          provide: EMBEDDING_SERVICE,
          useValue: mockProvider,
        },
      ],
    }).compile();

    module.useLogger(false);
    service = module.get<EmbeddingService>(EmbeddingService);
  });

  describe('getModel', () => {
    it('should return the configured default model', () => {
      expect(service.getModel()).toBe('nomic-embed-text');
    });
  });

  describe('getDimensions', () => {
    it('should delegate to EMBEDDING_SERVICE with default model', () => {
      expect(service.getDimensions()).toBe(768);
      expect(mockProvider.getDimensions).toHaveBeenCalledWith(
        'nomic-embed-text',
      );
    });
  });

  describe('embed', () => {
    it('should delegate to EMBEDDING_SERVICE with default model', async () => {
      const result = await service.embed('test text');

      expect(result).toEqual(mockEmbedding);
      expect(mockProvider.embed).toHaveBeenCalledWith(
        'test text',
        'nomic-embed-text',
      );
    });
  });

  describe('embedWithTokenCount', () => {
    it('should delegate to EMBEDDING_SERVICE with default model', async () => {
      const result = await service.embedWithTokenCount('hello world');

      expect(result.embedding).toEqual(mockEmbedding);
      expect(result.tokenCount).toBe(5);
      expect(mockProvider.embedWithTokenCount).toHaveBeenCalledWith(
        'hello world',
        'nomic-embed-text',
      );
    });
  });

  describe('embedBatch', () => {
    it('should delegate to EMBEDDING_SERVICE with default model', async () => {
      const results = await service.embedBatch(['text1']);

      expect(results).toHaveLength(1);
      expect(mockProvider.embedBatch).toHaveBeenCalledWith(
        ['text1'],
        'nomic-embed-text',
      );
    });
  });

  describe('checkHealth', () => {
    it('should delegate to EMBEDDING_SERVICE and include model', async () => {
      const result = await service.checkHealth();

      expect(result.status).toBe('ok');
      expect(result.model).toBe('nomic-embed-text');
      expect(mockProvider.checkHealth).toHaveBeenCalledWith('nomic-embed-text');
    });
  });
});
