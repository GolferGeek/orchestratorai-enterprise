import { TextExtractorService } from '../extractors/text-extractor.service';

describe('TextExtractorService', () => {
  let service: TextExtractorService;

  beforeEach(() => {
    service = new TextExtractorService();
  });

  describe('extract', () => {
    it('should extract text from UTF-8 buffer', async () => {
      const text = 'Hello, world!';
      const buffer = Buffer.from(text, 'utf-8');

      const result = await service.extract(buffer);

      expect(result.text).toBe(text);
      expect(result.metadata).toEqual({});
    });

    it('should trim whitespace', async () => {
      const buffer = Buffer.from('  Hello, world!  \n\n', 'utf-8');

      const result = await service.extract(buffer);

      expect(result.text).toBe('Hello, world!');
    });

    it('should remove BOM character', async () => {
      const textWithBom = '\uFEFFHello, world!';
      const buffer = Buffer.from(textWithBom, 'utf-8');

      const result = await service.extract(buffer);

      expect(result.text).toBe('Hello, world!');
    });

    it('should handle multi-line text', async () => {
      const text = 'Line 1\nLine 2\nLine 3';
      const buffer = Buffer.from(text, 'utf-8');

      const result = await service.extract(buffer);

      expect(result.text).toBe(text);
    });

    it('should handle special characters', async () => {
      const text = 'Héllo, wörld! 你好世界';
      const buffer = Buffer.from(text, 'utf-8');

      const result = await service.extract(buffer);

      expect(result.text).toBe(text);
    });
  });

  describe('extractText', () => {
    it('should return just the text string', async () => {
      const text = 'Hello, world!';
      const buffer = Buffer.from(text, 'utf-8');

      const result = await service.extractText(buffer);

      expect(result).toBe(text);
    });
  });
});
