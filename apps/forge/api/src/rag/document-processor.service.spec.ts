import { Test, TestingModule } from '@nestjs/testing';
import { DocumentProcessorService } from './document-processor.service';
import { DocumentsService } from './documents.service';
import { CollectionsService, RagCollection } from './collections.service';
import { ChunkingService, Chunk } from './chunking.service';
import { EMBEDDING_SERVICE, EmbeddingServiceProvider } from '../rag-storage';
import { PdfExtractorService } from './extractors/pdf-extractor.service';
import { DocxExtractorService } from './extractors/docx-extractor.service';
import { TextExtractorService } from './extractors/text-extractor.service';
import {
  ExtractionResult,
  PagedExtractionResult,
} from './interfaces/document-extractor.interface';

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
      expect(result.tokenCount).toBe(33); // 10 + 12 + 11
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

    it('should process a markdown document successfully', async () => {
      const buffer = Buffer.from('# Markdown content');

      textExtractor.extract.mockResolvedValue({
        text: '# Markdown content',
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
        'md',
      );

      expect(result.status).toBe('completed');
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
      expect(documentsService.updateDocumentStatus).toHaveBeenCalledWith(
        'doc-123',
        'test-org',
        'error',
        expect.stringContaining('Unsupported file type'),
      );
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

    it('should store extracted content in document', async () => {
      const buffer = Buffer.from('content');

      textExtractor.extract.mockResolvedValue({
        text: 'Extracted document text',
        metadata: {},
      });
      collectionsService.getCollection.mockResolvedValue(mockCollection);
      chunkingService.splitText.mockReturnValue(mockChunks);
      embeddingService.embedBatch.mockResolvedValue(mockEmbeddings);
      documentsService.insertChunks.mockResolvedValue(3);

      await service.processDocument(
        'doc-123',
        'test-org',
        'col-123',
        buffer,
        'txt',
      );

      expect(documentsService.updateDocumentContent).toHaveBeenCalledWith(
        'doc-123',
        'test-org',
        'Extracted document text',
      );
    });

    it('should use collection chunk configuration', async () => {
      const buffer = Buffer.from('content');
      const customCollection: RagCollection = {
        ...mockCollection,
        chunkSize: 1000,
        chunkOverlap: 100,
      };

      textExtractor.extract.mockResolvedValue({
        text: 'Some text',
        metadata: {},
      });
      collectionsService.getCollection.mockResolvedValue(customCollection);
      chunkingService.splitText.mockReturnValue(mockChunks);
      embeddingService.embedBatch.mockResolvedValue(mockEmbeddings);
      documentsService.insertChunks.mockResolvedValue(3);

      await service.processDocument(
        'doc-123',
        'test-org',
        'col-123',
        buffer,
        'txt',
      );

      expect(chunkingService.splitText).toHaveBeenCalledWith('Some text', {
        chunkSize: 1000,
        chunkOverlap: 100,
      });
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

      // Fail twice, then succeed
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

      // Always fail
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
      expect(embeddingService.embedBatch).toHaveBeenCalledTimes(3); // maxRetries = 3
    });
  });

  describe('processDocument - batch processing', () => {
    it('should process chunks in batches of 10', async () => {
      const buffer = Buffer.from('content');
      const manyChunks: Chunk[] = Array.from({ length: 25 }, (_, i) => ({
        content: `Chunk ${i} content`,
        chunkIndex: i,
        charOffset: i * 100,
      }));
      const manyEmbeddings = Array.from({ length: 25 }, (_, i) => ({
        embedding: Array(768).fill(i * 0.01),
        tokenCount: 10,
      }));

      textExtractor.extract.mockResolvedValue({
        text: 'Long text content',
        metadata: {},
      });
      collectionsService.getCollection.mockResolvedValue(mockCollection);
      chunkingService.splitText.mockReturnValue(manyChunks);

      // Mock embedBatch to return different batches
      embeddingService.embedBatch
        .mockResolvedValueOnce(manyEmbeddings.slice(0, 10))
        .mockResolvedValueOnce(manyEmbeddings.slice(10, 20))
        .mockResolvedValueOnce(manyEmbeddings.slice(20, 25));

      documentsService.insertChunks.mockResolvedValue(25);

      const result = await service.processDocument(
        'doc-123',
        'test-org',
        'col-123',
        buffer,
        'txt',
      );

      expect(result.status).toBe('completed');
      expect(result.chunkCount).toBe(25);
      expect(embeddingService.embedBatch).toHaveBeenCalledTimes(3); // 3 batches
    });
  });

  describe('processDocumentAsync', () => {
    it('should process document asynchronously', () => {
      const buffer = Buffer.from('content');

      textExtractor.extract.mockResolvedValue({
        text: 'Text content',
        metadata: {},
      });
      collectionsService.getCollection.mockResolvedValue(mockCollection);
      chunkingService.splitText.mockReturnValue(mockChunks);
      embeddingService.embedBatch.mockResolvedValue(mockEmbeddings);
      documentsService.insertChunks.mockResolvedValue(3);

      // Should not throw, returns void
      expect(() => {
        service.processDocumentAsync(
          'doc-123',
          'test-org',
          'col-123',
          buffer,
          'txt',
        );
      }).not.toThrow();
    });

    it('should catch and log errors without throwing', async () => {
      const buffer = Buffer.from('content');

      textExtractor.extract.mockRejectedValue(new Error('Extraction failed'));

      // Should not throw
      expect(() => {
        service.processDocumentAsync(
          'doc-123',
          'test-org',
          'col-123',
          buffer,
          'txt',
        );
      }).not.toThrow();

      // Give async processing time to complete
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
  });

  describe('processDocument - chunk data mapping', () => {
    it('should correctly map chunk data with embeddings to insertChunks', async () => {
      const buffer = Buffer.from('content');
      const chunksWithPages: Chunk[] = [
        { content: 'Page 1', chunkIndex: 0, charOffset: 0, pageNumber: 1 },
        { content: 'Page 2', chunkIndex: 1, charOffset: 50, pageNumber: 2 },
      ];

      pdfExtractor.extractPages.mockResolvedValue({
        text: 'Full text',
        metadata: { pageCount: 2 },
        pages: [
          { content: 'Page 1', pageNumber: 1 },
          { content: 'Page 2', pageNumber: 2 },
        ],
      });
      collectionsService.getCollection.mockResolvedValue(mockCollection);
      chunkingService.splitTextWithPages.mockReturnValue(chunksWithPages);
      embeddingService.embedBatch.mockResolvedValue([
        { embedding: [0.1, 0.2], tokenCount: 5 },
        { embedding: [0.3, 0.4], tokenCount: 6 },
      ]);
      documentsService.insertChunks.mockResolvedValue(2);

      await service.processDocument(
        'doc-123',
        'test-org',
        'col-123',
        buffer,
        'pdf',
      );

      expect(documentsService.insertChunks).toHaveBeenCalledWith(
        'doc-123',
        'test-org',
        [
          {
            content: 'Page 1',
            chunkIndex: 0,
            embedding: [0.1, 0.2],
            tokenCount: 5,
            pageNumber: 1,
            charOffset: 0,
            metadata: undefined,
          },
          {
            content: 'Page 2',
            chunkIndex: 1,
            embedding: [0.3, 0.4],
            tokenCount: 6,
            pageNumber: 2,
            charOffset: 50,
            metadata: undefined,
          },
        ],
      );
    });
  });
});
