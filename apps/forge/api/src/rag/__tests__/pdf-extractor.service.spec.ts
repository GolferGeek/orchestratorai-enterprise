import { Test, TestingModule } from '@nestjs/testing';
import { PdfExtractorService } from '../extractors/pdf-extractor.service';

// Mock pdf2json
const mockParseBuffer = jest.fn();
const mockOn = jest.fn();

jest.mock('pdf2json', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      on: mockOn,
      parseBuffer: mockParseBuffer,
    })),
  };
});

describe('PdfExtractorService', () => {
  let service: PdfExtractorService;

  beforeEach(async () => {
    // Reset mocks
    mockOn.mockReset();
    mockParseBuffer.mockReset();

    // Set up default mock behavior
    mockOn.mockImplementation(
      (event: string, callback: (...args: unknown[]) => unknown) => {
        if (event === 'pdfParser_dataReady') {
          // Store the callback for later invocation
          mockParseBuffer.mockImplementation(() => {
            callback({
              Pages: [
                {
                  Texts: [
                    { R: [{ T: 'Hello%20World' }] },
                    { R: [{ T: 'Page%201%20content' }] },
                  ],
                },
                {
                  Texts: [{ R: [{ T: 'Page%202%20content' }] }],
                },
              ],
              Meta: {
                Title: 'Test Document',
                Author: 'Test Author',
                CreationDate: '2024-01-01',
              },
            });
          });
        }
        return { on: mockOn }; // For chaining
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [PdfExtractorService],
    }).compile();

    module.useLogger(false);
    service = module.get<PdfExtractorService>(PdfExtractorService);

    // Wait for initialization
    await service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isAvailable', () => {
    it('should return true when pdf2json is loaded', () => {
      expect(service.isAvailable()).toBe(true);
    });
  });

  describe('extract', () => {
    it('should extract text and metadata from PDF', async () => {
      const buffer = Buffer.from('fake pdf content');

      const result = await service.extract(buffer);

      expect(result.text).toContain('Hello World');
      expect(result.text).toContain('Page 1 content');
      expect(result.text).toContain('Page 2 content');
      expect(result.metadata.title).toBe('Test Document');
      expect(result.metadata.author).toBe('Test Author');
      expect(result.metadata.pageCount).toBe(2);
    });

    it('should decode URI-encoded text', async () => {
      const buffer = Buffer.from('fake pdf content');

      const result = await service.extract(buffer);

      // %20 should be decoded to space
      expect(result.text).toContain('Hello World');
      expect(result.text).not.toContain('%20');
    });
  });

  describe('extractText', () => {
    it('should return just the text content', async () => {
      const buffer = Buffer.from('fake pdf content');

      const result = await service.extractText(buffer);

      expect(typeof result).toBe('string');
      expect(result).toContain('Hello World');
    });
  });

  describe('extractPages', () => {
    it('should return pages organized by page number', async () => {
      const buffer = Buffer.from('fake pdf content');

      const result = await service.extractPages(buffer);

      expect(result.pages).toHaveLength(2);
      expect(result.pages[0]?.pageNumber).toBe(1);
      expect(result.pages[0]?.content).toContain('Hello World');
      expect(result.pages[1]?.pageNumber).toBe(2);
      expect(result.pages[1]?.content).toContain('Page 2 content');
    });

    it('should include metadata in paged result', async () => {
      const buffer = Buffer.from('fake pdf content');

      const result = await service.extractPages(buffer);

      expect(result.metadata.title).toBe('Test Document');
      expect(result.metadata.author).toBe('Test Author');
      expect(result.metadata.pageCount).toBe(2);
    });
  });

  describe('error handling', () => {
    it('should handle parsing errors', async () => {
      // Set up error mock
      mockOn.mockImplementation(
        (event: string, callback: (...args: unknown[]) => unknown) => {
          if (event === 'pdfParser_dataError') {
            mockParseBuffer.mockImplementation(() => {
              callback({ parserError: new Error('Invalid PDF') });
            });
          }
          return { on: mockOn };
        },
      );

      const buffer = Buffer.from('invalid pdf');

      await expect(service.extract(buffer)).rejects.toThrow(
        'PDF parsing failed',
      );
    });

    it('should handle empty PDF', async () => {
      mockOn.mockImplementation(
        (event: string, callback: (...args: unknown[]) => unknown) => {
          if (event === 'pdfParser_dataReady') {
            mockParseBuffer.mockImplementation(() => {
              callback({
                Pages: [],
                Meta: {},
              });
            });
          }
          return { on: mockOn };
        },
      );

      const buffer = Buffer.from('empty pdf');

      const result = await service.extract(buffer);

      expect(result.text).toBe('');
      expect(result.metadata.pageCount).toBe(0);
    });

    it('should handle PDF with no text', async () => {
      mockOn.mockImplementation(
        (event: string, callback: (...args: unknown[]) => unknown) => {
          if (event === 'pdfParser_dataReady') {
            mockParseBuffer.mockImplementation(() => {
              callback({
                Pages: [{ Texts: [] }],
                Meta: { Title: 'Image-only PDF' },
              });
            });
          }
          return { on: mockOn };
        },
      );

      const buffer = Buffer.from('image-only pdf');

      const result = await service.extract(buffer);

      expect(result.text).toBe('');
      expect(result.metadata.title).toBe('Image-only PDF');
    });
  });

  describe('metadata extraction', () => {
    it('should handle missing metadata fields', async () => {
      mockOn.mockImplementation(
        (event: string, callback: (...args: unknown[]) => unknown) => {
          if (event === 'pdfParser_dataReady') {
            mockParseBuffer.mockImplementation(() => {
              callback({
                Pages: [{ Texts: [{ R: [{ T: 'Content' }] }] }],
                // No Meta field
              });
            });
          }
          return { on: mockOn };
        },
      );

      const buffer = Buffer.from('no metadata pdf');

      const result = await service.extract(buffer);

      expect(result.metadata.title).toBeUndefined();
      expect(result.metadata.author).toBeUndefined();
    });

    it('should extract creation date when available', async () => {
      const buffer = Buffer.from('pdf with date');

      const result = await service.extract(buffer);

      expect(result.metadata.creationDate).toBe('2024-01-01');
    });
  });

  describe('ensureInitialized', () => {
    it('should wait for initialization to complete', async () => {
      await service.ensureInitialized();
      expect(service.isAvailable()).toBe(true);
    });
  });
});

describe('PdfExtractorService - unavailable', () => {
  let service: PdfExtractorService;

  beforeEach(async () => {
    // Mock pdf2json to throw on import
    jest.resetModules();
    jest.doMock('pdf2json', () => {
      throw new Error('Module not found');
    });

    // Reimport the service with the failing mock
    const { PdfExtractorService: UnavailableService } =
      await import('../extractors/pdf-extractor.service');

    const module: TestingModule = await Test.createTestingModule({
      providers: [UnavailableService],
    }).compile();

    module.useLogger(false);
    service = module.get<PdfExtractorService>(UnavailableService);
    await service.onModuleInit();
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('should return false for isAvailable when pdf2json fails to load', () => {
    expect(service.isAvailable()).toBe(false);
  });

  it('should throw error when extracting without pdf2json', async () => {
    const buffer = Buffer.from('test');

    await expect(service.extract(buffer)).rejects.toThrow(
      'PDF extraction not available',
    );
  });
});
