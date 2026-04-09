import { Test, TestingModule } from '@nestjs/testing';
import { DocxExtractorService } from '@orchestratorai/planes/extractors';

// Mock mammoth
const mockExtractRawText = jest.fn();

jest.mock('mammoth', () => ({
  __esModule: true,
  default: {
    extractRawText: mockExtractRawText,
  },
}));

describe('DocxExtractorService', () => {
  let service: DocxExtractorService;

  beforeEach(async () => {
    // Reset mocks
    mockExtractRawText.mockReset();

    // Set up default mock behavior
    mockExtractRawText.mockResolvedValue({
      value: 'This is the extracted text from the DOCX document.',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [DocxExtractorService],
    }).compile();

    module.useLogger(false);
    service = module.get<DocxExtractorService>(DocxExtractorService);

    // Wait for mammoth initialization
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isAvailable', () => {
    it('should return true when mammoth is loaded', () => {
      expect(service.isAvailable()).toBe(true);
    });
  });

  describe('extract', () => {
    it('should extract text from DOCX', async () => {
      const buffer = Buffer.from('fake docx content');

      const result = await service.extract(buffer);

      expect(result.text).toBe(
        'This is the extracted text from the DOCX document.',
      );
      expect(mockExtractRawText).toHaveBeenCalledWith({ buffer });
    });

    it('should return empty metadata (mammoth limitation)', async () => {
      const buffer = Buffer.from('fake docx content');

      const result = await service.extract(buffer);

      // mammoth doesn't extract metadata
      expect(result.metadata.title).toBeUndefined();
      expect(result.metadata.author).toBeUndefined();
    });

    it('should trim extracted text', async () => {
      mockExtractRawText.mockResolvedValue({
        value: '  Text with whitespace  \n\n',
      });

      const buffer = Buffer.from('fake docx content');

      const result = await service.extract(buffer);

      expect(result.text).toBe('Text with whitespace');
    });
  });

  describe('extractText', () => {
    it('should return just the text content', async () => {
      const buffer = Buffer.from('fake docx content');

      const result = await service.extractText(buffer);

      expect(typeof result).toBe('string');
      expect(result).toBe('This is the extracted text from the DOCX document.');
    });
  });

  describe('error handling', () => {
    it('should handle extraction errors', async () => {
      mockExtractRawText.mockRejectedValue(new Error('Invalid DOCX file'));

      const buffer = Buffer.from('invalid docx');

      await expect(service.extract(buffer)).rejects.toThrow(
        'Failed to extract text from DOCX: Invalid DOCX file',
      );
    });

    it('should handle unknown errors', async () => {
      mockExtractRawText.mockRejectedValue('Unknown error');

      const buffer = Buffer.from('bad docx');

      await expect(service.extract(buffer)).rejects.toThrow(
        'Failed to extract text from DOCX: Unknown error',
      );
    });

    it('should handle empty DOCX', async () => {
      mockExtractRawText.mockResolvedValue({
        value: '',
      });

      const buffer = Buffer.from('empty docx');

      const result = await service.extract(buffer);

      expect(result.text).toBe('');
    });
  });
});

describe('DocxExtractorService - unavailable', () => {
  let service: DocxExtractorService;

  beforeEach(async () => {
    // Mock mammoth to throw on import
    jest.resetModules();
    jest.doMock('mammoth', () => {
      throw new Error('Module not found');
    });

    // Reimport the service with the failing mock
    const { DocxExtractorService: UnavailableService } =
      await import('@orchestratorai/planes/extractors');

    const module: TestingModule = await Test.createTestingModule({
      providers: [UnavailableService],
    }).compile();

    module.useLogger(false);
    service = module.get<DocxExtractorService>(UnavailableService);

    // Wait for initialization attempt
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('should return false for isAvailable when mammoth fails to load', () => {
    expect(service.isAvailable()).toBe(false);
  });

  it('should throw error when extracting without mammoth', async () => {
    const buffer = Buffer.from('test');

    await expect(service.extract(buffer)).rejects.toThrow(
      'DOCX extraction not available',
    );
  });

  it('should throw error for extractText without mammoth', async () => {
    const buffer = Buffer.from('test');

    await expect(service.extractText(buffer)).rejects.toThrow(
      'DOCX extraction not available',
    );
  });
});
