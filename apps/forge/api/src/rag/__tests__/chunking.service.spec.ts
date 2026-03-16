import { ChunkingService } from '../chunking.service';

describe('ChunkingService', () => {
  let service: ChunkingService;

  beforeEach(() => {
    service = new ChunkingService();
  });

  describe('splitText', () => {
    it('should return empty array for empty text', () => {
      const result = service.splitText('', {
        chunkSize: 100,
        chunkOverlap: 20,
      });
      expect(result).toEqual([]);
    });

    it('should return empty array for whitespace-only text', () => {
      const result = service.splitText('   \n\n  ', {
        chunkSize: 100,
        chunkOverlap: 20,
      });
      expect(result).toEqual([]);
    });

    it('should return single chunk for text smaller than chunk size', () => {
      const text = 'Hello, world!';
      const result = service.splitText(text, {
        chunkSize: 100,
        chunkOverlap: 20,
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.content).toBe(text);
      expect(result[0]?.chunkIndex).toBe(0);
    });

    it('should split text into multiple chunks', () => {
      const text =
        'This is paragraph one.\n\nThis is paragraph two.\n\nThis is paragraph three.';
      const result = service.splitText(text, {
        chunkSize: 30,
        chunkOverlap: 5,
      });

      expect(result.length).toBeGreaterThan(1);
      result.forEach((chunk, index) => {
        expect(chunk.chunkIndex).toBe(index);
        expect(chunk.content.length).toBeGreaterThan(0);
      });
    });

    it('should respect chunk size limit', () => {
      const text = 'A '.repeat(100); // 200 characters
      const chunkSize = 50;
      const result = service.splitText(text, {
        chunkSize,
        chunkOverlap: 10,
      });

      result.forEach((chunk) => {
        expect(chunk.content.length).toBeLessThanOrEqual(chunkSize + 10); // Allow some flexibility
      });
    });

    it('should split on paragraph breaks preferentially', () => {
      const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
      const result = service.splitText(text, {
        chunkSize: 20,
        chunkOverlap: 5,
      });

      // Should split on paragraph breaks
      expect(result.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('splitTextWithPages', () => {
    it('should include page numbers in chunks', () => {
      const pages = [
        { content: 'Page one content here.', pageNumber: 1 },
        { content: 'Page two content here.', pageNumber: 2 },
      ];

      const result = service.splitTextWithPages(pages, {
        chunkSize: 50,
        chunkOverlap: 10,
      });

      expect(result.length).toBeGreaterThanOrEqual(2);

      const page1Chunks = result.filter((c) => c.pageNumber === 1);
      const page2Chunks = result.filter((c) => c.pageNumber === 2);

      expect(page1Chunks.length).toBeGreaterThan(0);
      expect(page2Chunks.length).toBeGreaterThan(0);
    });

    it('should maintain global chunk indices across pages', () => {
      const pages = [
        { content: 'First page content.', pageNumber: 1 },
        { content: 'Second page content.', pageNumber: 2 },
      ];

      const result = service.splitTextWithPages(pages, {
        chunkSize: 100,
        chunkOverlap: 10,
      });

      // Indices should be sequential
      result.forEach((chunk, index) => {
        expect(chunk.chunkIndex).toBe(index);
      });
    });
  });

  describe('estimateTokenCount', () => {
    it('should estimate tokens based on character count', () => {
      const text = 'Hello world'; // 11 characters
      const estimate = service.estimateTokenCount(text);

      // Rough estimate: ~4 chars per token
      expect(estimate).toBeGreaterThan(0);
      expect(estimate).toBeLessThanOrEqual(11);
    });

    it('should return 0 for empty string', () => {
      const estimate = service.estimateTokenCount('');
      expect(estimate).toBe(0);
    });
  });
});
