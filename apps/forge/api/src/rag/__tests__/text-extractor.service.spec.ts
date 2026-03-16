import { Test, TestingModule } from '@nestjs/testing';
import { TextExtractorService } from '../extractors/text-extractor.service';

describe('TextExtractorService', () => {
  let service: TextExtractorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TextExtractorService],
    }).compile();

    module.useLogger(false);
    service = module.get<TextExtractorService>(TextExtractorService);
  });

  describe('isAvailable', () => {
    it('should always return true', () => {
      expect(service.isAvailable()).toBe(true);
    });
  });

  describe('extract', () => {
    it('should extract text from buffer', async () => {
      const buffer = Buffer.from('Hello, this is a test document.');

      const result = await service.extract(buffer);

      expect(result.text).toBe('Hello, this is a test document.');
      expect(result.metadata).toEqual({});
    });

    it('should trim whitespace from text', async () => {
      const buffer = Buffer.from('  Text with whitespace  \n\n');

      const result = await service.extract(buffer);

      expect(result.text).toBe('Text with whitespace');
    });

    it('should handle UTF-8 text', async () => {
      const buffer = Buffer.from('Hello 世界! Привет мир! مرحبا');

      const result = await service.extract(buffer);

      expect(result.text).toBe('Hello 世界! Привет мир! مرحبا');
    });

    it('should remove BOM (Byte Order Mark)', async () => {
      // UTF-8 BOM is EF BB BF (0xFEFF)
      const bom = Buffer.from([0xef, 0xbb, 0xbf]);
      const text = Buffer.from('Text after BOM');
      const buffer = Buffer.concat([bom, text]);

      const result = await service.extract(buffer);

      expect(result.text).toBe('Text after BOM');
      expect(result.text.startsWith('\uFEFF')).toBe(false);
    });

    it('should handle empty buffer', async () => {
      const buffer = Buffer.from('');

      const result = await service.extract(buffer);

      expect(result.text).toBe('');
    });

    it('should handle markdown content', async () => {
      const markdown = `# Title

This is a **bold** statement.

- Item 1
- Item 2

\`\`\`javascript
const code = 'example';
\`\`\``;

      const buffer = Buffer.from(markdown);

      const result = await service.extract(buffer);

      expect(result.text).toContain('# Title');
      expect(result.text).toContain('**bold**');
      expect(result.text).toContain('const code');
    });

    it('should handle multiline text', async () => {
      const text = 'Line 1\nLine 2\nLine 3';
      const buffer = Buffer.from(text);

      const result = await service.extract(buffer);

      expect(result.text).toBe('Line 1\nLine 2\nLine 3');
      expect(result.text.split('\n')).toHaveLength(3);
    });
  });

  describe('extractText', () => {
    it('should return just the text content', async () => {
      const buffer = Buffer.from('Simple text content');

      const result = await service.extractText(buffer);

      expect(typeof result).toBe('string');
      expect(result).toBe('Simple text content');
    });

    it('should trim text', async () => {
      const buffer = Buffer.from('  trimmed text  ');

      const result = await service.extractText(buffer);

      expect(result).toBe('trimmed text');
    });
  });

  describe('special characters', () => {
    it('should handle newlines and tabs', async () => {
      const buffer = Buffer.from('Line1\tTabbed\nLine2\r\nLine3');

      const result = await service.extract(buffer);

      expect(result.text).toContain('Line1');
      expect(result.text).toContain('\t');
      expect(result.text).toContain('Line2');
    });

    it('should handle special characters', async () => {
      const buffer = Buffer.from('Special: <>&"\'@#$%^*()');

      const result = await service.extract(buffer);

      expect(result.text).toBe('Special: <>&"\'@#$%^*()');
    });

    it('should handle emoji', async () => {
      const buffer = Buffer.from('Hello 👋 World 🌍');

      const result = await service.extract(buffer);

      expect(result.text).toBe('Hello 👋 World 🌍');
    });
  });
});
