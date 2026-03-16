import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

/**
 * ContentHashService - Generates content hashes for deduplication
 *
 * Normalizes content before hashing to ensure consistent deduplication
 * across slight variations in whitespace, formatting, etc.
 */
@Injectable()
export class ContentHashService {
  private readonly logger = new Logger(ContentHashService.name);

  /**
   * Generate a SHA-256 hash for content
   *
   * @param content - Raw content to hash
   * @param normalize - Whether to normalize content before hashing (default: true)
   * @returns SHA-256 hash as hex string
   */
  hash(content: string, normalize = true): string {
    const processed = normalize ? this.normalizeContent(content) : content;
    return createHash('sha256').update(processed).digest('hex');
  }

  /**
   * Normalize content for consistent hashing
   *
   * Normalizations applied:
   * - Convert to lowercase
   * - Collapse multiple whitespace to single space
   * - Remove leading/trailing whitespace
   * - Remove common HTML entities
   * - Remove URLs (they often include tracking params)
   *
   * @param content - Raw content
   * @returns Normalized content
   */
  normalizeContent(content: string): string {
    let normalized = content;

    // Convert to lowercase
    normalized = normalized.toLowerCase();

    // Remove URLs (they often contain tracking parameters)
    normalized = normalized.replace(/https?:\/\/[^\s]+/g, '[URL]');

    // Remove common HTML entities
    normalized = normalized
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // Remove HTML tags
    normalized = normalized.replace(/<[^>]*>/g, ' ');

    // Collapse multiple whitespace to single space
    normalized = normalized.replace(/\s+/g, ' ');

    // Remove leading/trailing whitespace
    normalized = normalized.trim();

    return normalized;
  }

  /**
   * Generate a hash for an article/news item
   * Uses title + first N characters of content for better deduplication
   *
   * @param title - Article title
   * @param content - Article content
   * @param contentLength - Number of content characters to include (default: 500)
   * @returns SHA-256 hash
   */
  hashArticle(title: string, content: string, contentLength = 500): string {
    const normalizedTitle = this.normalizeContent(title);
    const normalizedContent = this.normalizeContent(content).substring(
      0,
      contentLength,
    );

    return this.hash(`${normalizedTitle}|${normalizedContent}`, false);
  }

  /**
   * Generate a hash for a tweet/social media post
   * Includes author for better deduplication
   *
   * @param authorId - Author identifier
   * @param content - Post content
   * @returns SHA-256 hash
   */
  hashSocialPost(authorId: string, content: string): string {
    const normalizedContent = this.normalizeContent(content);
    return this.hash(`${authorId}|${normalizedContent}`, false);
  }

  /**
   * Generate a hash for RSS feed items
   * Uses guid if available, otherwise title + pubDate
   *
   * @param item - RSS item data
   * @returns SHA-256 hash
   */
  hashRssItem(item: {
    guid?: string;
    title?: string;
    pubDate?: string;
    link?: string;
  }): string {
    // Prefer guid as it should be unique
    if (item.guid) {
      return this.hash(item.guid, false);
    }

    // Fall back to title + pubDate + link
    const parts: string[] = [];
    if (item.title) parts.push(this.normalizeContent(item.title));
    if (item.pubDate) parts.push(item.pubDate);
    if (item.link) parts.push(item.link);

    return this.hash(parts.join('|'), false);
  }

  /**
   * Check if two content pieces are likely duplicates
   * Uses fuzzy matching for near-duplicates
   *
   * @param content1 - First content
   * @param content2 - Second content
   * @param threshold - Similarity threshold (0-1, default: 0.9)
   * @returns True if contents are likely duplicates
   */
  isSimilar(content1: string, content2: string, threshold = 0.9): boolean {
    const norm1 = this.normalizeContent(content1);
    const norm2 = this.normalizeContent(content2);

    // Quick check: exact match after normalization
    if (norm1 === norm2) {
      return true;
    }

    // Check if one is a substring of the other
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      return true;
    }

    // Calculate Jaccard similarity on word sets
    const words1 = new Set(norm1.split(' ').filter((w) => w.length > 2));
    const words2 = new Set(norm2.split(' ').filter((w) => w.length > 2));

    if (words1.size === 0 || words2.size === 0) {
      return false;
    }

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    const similarity = intersection.size / union.size;
    return similarity >= threshold;
  }

  /**
   * Extract key phrases for content fingerprinting
   * Used for fuzzy deduplication
   *
   * @param content - Content to extract phrases from
   * @param maxPhrases - Maximum number of phrases to extract (default: 10)
   * @returns Array of key phrases
   */
  extractKeyPhrases(content: string, maxPhrases = 10): string[] {
    const normalized = this.normalizeContent(content);
    const words = normalized.split(' ').filter((w) => w.length > 3);

    // Extract bigrams (2-word phrases)
    const phrases: string[] = [];
    for (let i = 0; i < words.length - 1 && phrases.length < maxPhrases; i++) {
      const phrase = `${words[i]} ${words[i + 1]}`;
      phrases.push(phrase);
    }

    return phrases;
  }

  /**
   * Generate a fingerprint for content
   * Combines hash with key phrases for hybrid deduplication
   *
   * @param content - Content to fingerprint
   * @returns Fingerprint object
   */
  fingerprint(content: string): {
    hash: string;
    keyPhrases: string[];
    wordCount: number;
  } {
    const normalized = this.normalizeContent(content);
    const words = normalized.split(' ').filter((w) => w.length > 0);

    return {
      hash: this.hash(normalized, false),
      keyPhrases: this.extractKeyPhrases(content),
      wordCount: words.length,
    };
  }
}
