import { Test, TestingModule } from '@nestjs/testing';
import { DocumentProcessorService } from './document-processor.service';
import { DocumentsService } from './documents.service';
import { CollectionsService } from './collections.service';
import { ChunkingService, Chunk } from './chunking.service';
import { EMBEDDING_SERVICE } from './embedding.interface';
import type { EmbeddingServiceProvider } from './embedding.interface';
import type { RagCollection } from './rag-storage.interface';
import {
  PdfExtractorService,
  DocxExtractorService,
  TextExtractorService,
  ExtractionResult,
  PagedExtractionResult,
} from '@orchestratorai/planes/extractors';

describe('DocumentProcessorService', () => {
  let service: DocumentProcessorService;
  let documentsService: jest.Mocked<DocumentsService>;
  let collectionsService: jest.Mocked<CollectionsService>;
  let chunkingService: jest.Mocked<ChunkingService>;
  let embeddingService: jest.Mocked<EmbeddingServiceProvider>;
  let pdfExtractor: jest.Mocked<PdfExtractorService>;
  let docxExtractor: jest.Mocked<DocxExtractorService>;
  let textExtractor: jest.Mocked<TextExtractorService>;

  const mockCollection: RagCollection = {
    id: 'col-123',
    name: 'Test Collection',
    slug: 'test-collection',
    organizationSlug: 'test-org',
    chunkSize: 500,
    chunkOverlap: 50,
    embeddingModel: 'nomic-embed-text',
    embeddingDimensions: 768,
    documentCount: 0,
    chunkCount: 0,
    totalTokens: 0,
    description: 'Test description',
    status: 'active',
    requiredRole: null,
    allowedUsers: null,
    complexityType: 'basic',
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockChunks: Chunk[] = [
    { content: 'Chunk 1 content', chunkIndex: 0, charOffset: 0 },
    { content: 'Chunk 2 content', chunkIndex: 1, charOffset: 100 },
    { content: 'Chunk 3 content', chunkIndex: 2, charOffset: 200 },
  ];

  const mockEmbeddings = [
    { embedding: Array(768).fill(0.1), tokenCount: 10 },
    { embedding: Array(768).fill(0.2), tokenCount: 12 },
    { embedding: Array(768).fill(0.3), tokenCount: 11 },
  ];

  const _mockExtractionResult: ExtractionResult = {
    text: 'Extracted text',
    metadata: {},
  };

  const mockPagedExtractionResult: PagedExtractionResult = {
    text: 'Extracted PDF text',
    metadata: { pageCount: 2 },
    pages: [
      { content: 'Page 1 content', pageNumber: 1 },
      { content: 'Page 2 content', pageNumber: 2 },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentProcessorService,
        {
          provide: DocumentsService,
          useValue: {
            updateDocumentStatus: jest.fn(),
            updateDocumentContent: jest.fn(),
            insertChunks: jest.fn(),
          },
        },
        {
          provide: CollectionsService,
          useValue: {
            getCollection: jest.fn(),
          },
        },
        {
          provide: ChunkingService,
          useValue: {
            splitText: jest.fn(),
            splitTextWithPages: jest.fn(),
          },
        },
        {
          provide: EMBEDDING_SERVICE,
          useValue: {
            embed: jest.fn(),
            embedBatch: jest.fn(),
            embedWithTokenCount: jest.fn(),
            getDimensions: jest.fn().mockReturnValue(768),
            getRecommendedThreshold: jest.fn().mockReturnValue(0.6),
            checkHealth: jest.fn(),
          },
        },
        {
          provide: PdfExtractorService,
          useValue: {
            extractPages: jest.fn(),
          },
        },
        {
          provide: DocxExtractorService,
          useValue: {
            extract: jest.fn(),
          },
        },
        {
          provide: TextExtractorService,
          useValue: {
            extract: jest.fn(),
          },
        },
      ],
    }).compile();

    module.useLogger(false);

    service = module.get<DocumentProcessorService>(DocumentProcessorService);
    documentsService = module.get(DocumentsService);
    collectionsService = module.get(CollectionsService);
    chunkingService = module.get(ChunkingService);
    embeddingService = module.get(EMBEDDING_SERVICE);
    pdfExtractor = module.get(PdfExtractorService);
    docxExtractor = module.get(DocxExtractorService);
    textExtractor = module.get(TextExtractorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processDocument', () => {
    it('should process a PDF document successfully', async () => {
      const buffer = Buffer.from('PDF content');

      pdfExtractor.extractPages.mockResolvedValue(mockPagedExtractionResult);
      collectionsService.getCollection.mockResolvedValue(mockCollection);
      chunkingService.splitTextWithPages.mockReturnValue(mockChunks);
      embeddingService.embedBatch.mockResolvedValue(mockEmbeddings);
      documentsService.insertChunks.mockResolvedValue(3);

      const result = await service.processDocument(
        'doc-123',
        'test-org',
        'col-123',
        buffer,
        'pdf',
      );

      expect(result.status).toBe('completed');
      expect(result.chunkCount).toBe(3);
      expect(result.tokenCount).toBe(33);
      expect(documentsService.updateDocumentStatus).toHaveBeenCalledWith(
        'doc-123',
        'test-org',
        'processing',
      );
      expect(pdfExtractor.extractPages).toHaveBeenCalledWith(buffer);
      expect(chunkingService.splitTextWithPages).toHaveBeenCalled();
    });

    it('should process a DOCX document successfully', async () => {
      const buffer = Buffer.from('DOCX content');

      docxExtractor.extract.mockResolvedValue({
        text: 'Extracted DOCX text',
        metadata: {},
      });
      collectionsService.getCollection.mockResolvedValue(mockCollection);
      chunkingService.splitText.mockReturnValue(mockChunks);
      embeddingService.embedBatch.mockResolvedValue(mockEmbeddings);
      documentsService.insertChunks.mockResolvedValue(3);

      const result = await service.processDocument(
        'doc-123',
        'test-org',
        'col-123',
        buffer,
        'docx',
      );

      expect(result.status).toBe('completed');
      expect(docxExtractor.extract).toHaveBeenCalledWith(buffer);
      expect(chunkingService.splitText).toHaveBeenCalled();
    });

    it('should process a TXT document successfully', async () => {
      const buffer = Buffer.from('Plain text content');

      textExtractor.extract.mockResolvedValue({
        text: 'Plain text content',
        metadata: {},
      });
      collectionsService.getCollection.mockResolvedValue(mockCollection);
      chunkingService.splitText.mockReturnValue(mockChunks);
      embeddingService.embedBatch.mockResolvedValue(mockEmbeddings);
      documentsService.insertChunks.mockResolvedValue(3);

      const result = await service.processDocument(
        'doc-123',
        'test-org',
        'col-123',
        buffer,
        'txt',
      );

      expect(result.status).toBe('completed');
      expect(textExtractor.extract).toHaveBeenCalledWith(buffer);
    });

    it('should return error for unsupported file type', async () => {
      const buffer = Buffer.from('content');

      const result = await service.processDocument(
        'doc-123',
        'test-org',
        'col-123',
        buffer,
        'xyz',
      );

      expect(result.status).toBe('error');
      expect(result.error).toContain('Unsupported file type');
    });

    it('should return error when extraction returns empty text', async () => {
      const buffer = Buffer.from('content');

      textExtractor.extract.mockResolvedValue({ text: '', metadata: {} });

      const result = await service.processDocument(
        'doc-123',
        'test-org',
        'col-123',
        buffer,
        'txt',
      );

      expect(result.status).toBe('error');
      expect(result.error).toContain('No text content extracted');
    });

    it('should return error when no chunks generated', async () => {
      const buffer = Buffer.from('content');

      textExtractor.extract.mockResolvedValue({
        text: 'Some text',
        metadata: {},
      });
      collectionsService.getCollection.mockResolvedValue(mockCollection);
      chunkingService.splitText.mockReturnValue([]);

      const result = await service.processDocument(
        'doc-123',
        'test-org',
        'col-123',
        buffer,
        'txt',
      );

      expect(result.status).toBe('error');
      expect(result.error).toContain('No chunks generated');
    });
  });

  describe('processDocument - embedding retry logic', () => {
    it('should retry embedding on failure', async () => {
      const buffer = Buffer.from('content');

      textExtractor.extract.mockResolvedValue({
        text: 'Text content',
        metadata: {},
      });
      collectionsService.getCollection.mockResolvedValue(mockCollection);
      chunkingService.splitText.mockReturnValue(mockChunks);

      embeddingService.embedBatch
        .mockRejectedValueOnce(new Error('API error'))
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce(mockEmbeddings);

      documentsService.insertChunks.mockResolvedValue(3);

      const result = await service.processDocument(
        'doc-123',
        'test-org',
        'col-123',
        buffer,
        'txt',
      );

      expect(result.status).toBe('completed');
      expect(embeddingService.embedBatch).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const buffer = Buffer.from('content');

      textExtractor.extract.mockResolvedValue({
        text: 'Text content',
        metadata: {},
      });
      collectionsService.getCollection.mockResolvedValue(mockCollection);
      chunkingService.splitText.mockReturnValue(mockChunks);

      embeddingService.embedBatch.mockRejectedValue(
        new Error('Persistent error'),
      );

      const result = await service.processDocument(
        'doc-123',
        'test-org',
        'col-123',
        buffer,
        'txt',
      );

      expect(result.status).toBe('error');
      expect(result.error).toContain('Embedding generation failed after');
      expect(embeddingService.embedBatch).toHaveBeenCalledTimes(3);
    });
  });
});
