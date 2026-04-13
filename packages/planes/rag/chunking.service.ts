import { Injectable, Logger } from '@nestjs/common';

export interface Chunk {
  content: string;
  chunkIndex: number;
  charOffset: number;
  pageNumber?: number;
  metadata?: Record<string, unknown>;
}

export interface ChunkingConfig {
  chunkSize: number;
  chunkOverlap: number;
  separators?: string[];
}

/**
 * Chunking Service
 *
 * Implements recursive text splitting for RAG documents.
 * Based on LangChain's RecursiveCharacterTextSplitter pattern.
 */
@Injectable()
export class ChunkingService {
  private readonly logger = new Logger(ChunkingService.name);

  // Default separators in order of preference
  private readonly defaultSeparators = [
    '\n\n', // Paragraph break
    '\n', // Line break
    '. ', // Sentence end
    '? ', // Question end
    '! ', // Exclamation end
    '; ', // Semicolon
    ', ', // Comma
    ' ', // Space
    '', // Character
  ];

  /**
   * Split text into chunks using recursive character splitting
   */
  splitText(text: string, config: ChunkingConfig): Chunk[] {
    const {
      chunkSize,
      chunkOverlap,
      separators = this.defaultSeparators,
    } = config;

    if (!text || text.trim().length === 0) {
      return [];
    }

    const chunks = this.recursiveSplit(
      text,
      separators,
      chunkSize,
      chunkOverlap,
    );

    // Build chunk objects with metadata
    return chunks.map((content, index) => ({
      content: content.trim(),
      chunkIndex: index,
      charOffset: this.findCharOffset(text, content, index, chunks),
    }));
  }

  /**
   * Split text with page information (for PDFs)
   */
  splitTextWithPages(
    pages: Array<{ content: string; pageNumber: number }>,
    config: ChunkingConfig,
  ): Chunk[] {
    const chunks: Chunk[] = [];
    let globalIndex = 0;
    let globalOffset = 0;

    for (const page of pages) {
      const pageChunks = this.splitText(page.content, config);

      for (const chunk of pageChunks) {
        chunks.push({
          ...chunk,
          chunkIndex: globalIndex++,
          charOffset: globalOffset + chunk.charOffset,
          pageNumber: page.pageNumber,
        });
      }

      globalOffset += page.content.length + 1; // +1 for page separator
    }

    return chunks;
  }

  /**
   * Recursive splitting implementation
   */
  private recursiveSplit(
    text: string,
    separators: string[],
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    // Base case: text is small enough
    if (text.length <= chunkSize) {
      return text.trim() ? [text] : [];
    }

    // Find the best separator to use
    const separator = separators.find(
      (sep) => sep === '' || text.includes(sep),
    );

    if (!separator && separator !== '') {
      // No separator found, split by character
      return this.splitBySize(text, chunkSize, chunkOverlap);
    }

    // Split by the separator
    const splits = separator === '' ? [...text] : text.split(separator);

    // Merge small splits together
    const chunks: string[] = [];
    let currentChunk = '';

    for (const split of splits) {
      const potentialChunk =
        currentChunk +
        (currentChunk && separator !== '' ? separator : '') +
        split;

      if (potentialChunk.length <= chunkSize) {
        currentChunk = potentialChunk;
      } else if (currentChunk) {
        // Current chunk is full, try to recursively split if it's too big
        if (
          currentChunk.length > chunkSize &&
          separators.indexOf(separator) < separators.length - 1
        ) {
          const subChunks = this.recursiveSplit(
            currentChunk,
            separators.slice(separators.indexOf(separator) + 1),
            chunkSize,
            chunkOverlap,
          );
          chunks.push(...subChunks);
        } else {
          chunks.push(currentChunk);
        }

        // Start new chunk with overlap
        const overlap = this.getOverlap(currentChunk, chunkOverlap);
        currentChunk = overlap + (overlap ? separator : '') + split;
      } else {
        // Split is too big on its own, recursively split it
        const subChunks = this.recursiveSplit(
          split,
          separators.slice(separators.indexOf(separator) + 1),
          chunkSize,
          chunkOverlap,
        );
        chunks.push(...subChunks);
      }
    }

    // Don't forget the last chunk
    if (currentChunk.trim()) {
      if (
        currentChunk.length > chunkSize &&
        separators.indexOf(separator) < separators.length - 1
      ) {
        const subChunks = this.recursiveSplit(
          currentChunk,
          separators.slice(separators.indexOf(separator) + 1),
          chunkSize,
          chunkOverlap,
        );
        chunks.push(...subChunks);
      } else {
        chunks.push(currentChunk);
      }
    }

    return chunks;
  }

  /**
   * Simple size-based splitting as fallback
   */
  private splitBySize(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.slice(start, end));
      start = end - chunkOverlap;

      // Prevent infinite loop
      if (start >= text.length - chunkOverlap) {
        break;
      }
    }

    return chunks;
  }

  /**
   * Get overlap text from the end of a chunk
   */
  private getOverlap(text: string, overlapSize: number): string {
    if (text.length <= overlapSize) {
      return text;
    }

    // Try to find a natural break point within the overlap region
    const overlapText = text.slice(-overlapSize);
    const spaceIndex = overlapText.indexOf(' ');

    if (spaceIndex > 0 && spaceIndex < overlapSize / 2) {
      return overlapText.slice(spaceIndex + 1);
    }

    return overlapText;
  }

  /**
   * Find the character offset of a chunk in the original text
   */
  private findCharOffset(
    _originalText: string,
    _chunkContent: string,
    index: number,
    allChunks: string[],
  ): number {
    // Simple approach: sum lengths of previous chunks
    // This is approximate due to separators and overlap
    let offset = 0;
    for (let i = 0; i < index; i++) {
      const chunk = allChunks[i];
      if (chunk) {
        offset += chunk.length;
      }
    }
    return offset;
  }

  /**
   * Estimate token count for a text
   * Rough approximation: ~4 characters per token for English
   */
  estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
