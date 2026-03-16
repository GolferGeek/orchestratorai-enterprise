import { Test, TestingModule } from '@nestjs/testing';
import { ChunkingService, ChunkingConfig } from './chunking.service';

describe('ChunkingService', () => {
  let service: ChunkingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChunkingService],
    }).compile();

    module.useLogger(false);

    service = module.get<ChunkingService>(ChunkingService);
  });

  describe('splitText', () => {
    const defaultConfig: ChunkingConfig = {
      chunkSize: 100,
      chunkOverlap: 20,
    };

    it('should return empty array for empty text', () => {
      const result = service.splitText('', defaultConfig);
      expect(result).toEqual([]);
    });

    it('should return empty array for whitespace-only text', () => {
      const result = service.splitText('   \n\n   ', defaultConfig);
      expect(result).toEqual([]);
    });

    it('should return single chunk for text smaller than chunkSize', () => {
      const text = 'This is a short text.';
      const result = service.splitText(text, defaultConfig);

      expect(result).toHaveLength(1);
      expect(result[0]!.content).toBe(text);
      expect(result[0]!.chunkIndex).toBe(0);
      expect(result[0]!.charOffset).toBe(0);
    });

    it('should split text on paragraph breaks', () => {
      const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
      const result = service.splitText(text, {
        chunkSize: 30,
        chunkOverlap: 5,
      });

      expect(result.length).toBeGreaterThan(1);
      // Each chunk should be trimmed
      result.forEach((chunk) => {
        expect(chunk.content).toBe(chunk.content.trim());
      });
    });

    it('should split text on line breaks when no paragraphs', () => {
      const text = 'Line one.\nLine two.\nLine three.\nLine four.';
      const result = service.splitText(text, {
        chunkSize: 25,
        chunkOverlap: 5,
      });

      expect(result.length).toBeGreaterThan(1);
    });

    it('should split on sentences when needed', () => {
      const text =
        'First sentence. Second sentence. Third sentence. Fourth sentence.';
      const result = service.splitText(text, {
        chunkSize: 40,
        chunkOverlap: 10,
      });

      expect(result.length).toBeGreaterThan(1);
    });

    it('should include chunkIndex for each chunk', () => {
      const text = 'A. B. C. D. E. F. G. H.';
      const result = service.splitText(text, {
        chunkSize: 10,
        chunkOverlap: 2,
      });

      result.forEach((chunk, index) => {
        expect(chunk.chunkIndex).toBe(index);
      });
    });

    it('should include charOffset for each chunk', () => {
      const text = 'Part one. Part two. Part three.';
      const result = service.splitText(text, {
        chunkSize: 15,
        chunkOverlap: 3,
      });

      // First chunk should have offset 0
      expect(result[0]!.charOffset).toBe(0);
      // Subsequent chunks should have increasing offsets
      for (let i = 1; i < result.length; i++) {
        expect(result[i]!.charOffset).toBeGreaterThan(
          result[i - 1]!.charOffset,
        );
      }
    });

    it('should handle very long text', () => {
      const text = 'word '.repeat(1000);
      const result = service.splitText(text, {
        chunkSize: 100,
        chunkOverlap: 20,
      });

      expect(result.length).toBeGreaterThan(10);
      result.forEach((chunk) => {
        expect(chunk.content.length).toBeLessThanOrEqual(105); // Some tolerance
      });
    });

    it('should use custom separators when provided', () => {
      const text = 'A|B|C|D|E|F';
      const result = service.splitText(text, {
        chunkSize: 3,
        chunkOverlap: 0,
        separators: ['|'],
      });

      expect(result.length).toBeGreaterThan(1);
    });
  });

  describe('splitTextWithPages', () => {
    it('should split multiple pages and track page numbers', () => {
      const pages = [
        { content: 'Page one content here.', pageNumber: 1 },
        { content: 'Page two content here.', pageNumber: 2 },
        { content: 'Page three content here.', pageNumber: 3 },
      ];

      const result = service.splitTextWithPages(pages, {
        chunkSize: 50,
        chunkOverlap: 10,
      });

      expect(result.length).toBeGreaterThan(0);

      // Check that page numbers are preserved
      const pageNumbers = [...new Set(result.map((c) => c.pageNumber))];
      expect(pageNumbers).toEqual(expect.arrayContaining([1, 2, 3]));
    });

    it('should maintain global chunk indices across pages', () => {
      const pages = [
        { content: 'Short.', pageNumber: 1 },
        { content: 'Also short.', pageNumber: 2 },
      ];

      const result = service.splitTextWithPages(pages, {
        chunkSize: 100,
        chunkOverlap: 10,
      });

      // Indices should be sequential across all pages
      result.forEach((chunk, index) => {
        expect(chunk.chunkIndex).toBe(index);
      });
    });

    it('should calculate global char offsets across pages', () => {
      const pages = [
        { content: '12345', pageNumber: 1 },
        { content: '67890', pageNumber: 2 },
      ];

      const result = service.splitTextWithPages(pages, {
        chunkSize: 100,
        chunkOverlap: 0,
      });

      // Second page chunks should have offset including first page length + 1
      if (result.length >= 2) {
        expect(result[1]!.charOffset).toBeGreaterThanOrEqual(5);
      }
    });

    it('should handle empty pages', () => {
      const pages = [
        { content: '', pageNumber: 1 },
        { content: 'Content', pageNumber: 2 },
      ];

      const result = service.splitTextWithPages(pages, {
        chunkSize: 100,
        chunkOverlap: 10,
      });

      // Should skip empty page
      expect(result.every((c) => c.content.length > 0)).toBe(true);
    });

    it('should handle single page', () => {
      const pages = [{ content: 'Single page content.', pageNumber: 1 }];

      const result = service.splitTextWithPages(pages, {
        chunkSize: 100,
        chunkOverlap: 10,
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.pageNumber).toBe(1);
    });
  });

  describe('estimateTokenCount', () => {
    it('should estimate tokens as ~4 chars per token', () => {
      // 12 characters should be ~3 tokens
      expect(service.estimateTokenCount('hello world!')).toBe(3);
    });

    it('should handle empty string', () => {
      expect(service.estimateTokenCount('')).toBe(0);
    });

    it('should round up fractional tokens', () => {
      // 5 characters / 4 = 1.25, should round to 2
      expect(service.estimateTokenCount('hello')).toBe(2);
    });

    it('should handle long text', () => {
      const text = 'a'.repeat(1000);
      expect(service.estimateTokenCount(text)).toBe(250);
    });
  });

  describe('edge cases', () => {
    it('should handle text with only spaces as separators', () => {
      const text = 'word1 word2 word3 word4 word5';
      const result = service.splitText(text, {
        chunkSize: 10,
        chunkOverlap: 2,
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle text with no natural separators', () => {
      const text = 'abcdefghijklmnopqrstuvwxyz';
      const result = service.splitText(text, {
        chunkSize: 5,
        chunkOverlap: 1,
      });

      expect(result.length).toBeGreaterThan(1);
    });

    it('should handle unicode text', () => {
      const text = '你好世界。这是中文文本。测试分割功能。';
      const result = service.splitText(text, {
        chunkSize: 10,
        chunkOverlap: 2,
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle text with mixed separators', () => {
      const text =
        'Para 1.\n\nPara 2.\nLine 1. Line 2? Line 3! More, text; here.';
      const result = service.splitText(text, {
        chunkSize: 20,
        chunkOverlap: 5,
      });

      expect(result.length).toBeGreaterThan(1);
    });

    it('should handle chunk overlap larger than some chunks', () => {
      const text = 'A. B. C.';
      const result = service.splitText(text, {
        chunkSize: 5,
        chunkOverlap: 10, // Overlap larger than chunk size
      });

      // Should still produce valid output
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
