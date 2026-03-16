import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { ArticleRepository } from '../repositories/article.repository';
import { DeduplicationResult } from '../interfaces';

/**
 * Default deduplication configuration
 */
export const DEFAULT_DEDUP_CONFIG = {
  fuzzy_dedup_enabled: true,
  cross_source_dedup: true,
  title_similarity_threshold: 0.85,
  phrase_overlap_threshold: 0.7,
  dedup_hours_back: 72,
};

/**
 * DeduplicationService - 4-layer content deduplication
 *
 * Layer 1: Exact hash match within same source
 * Layer 2: Cross-source hash check (same content from different source)
 * Layer 3: Fuzzy title matching (Jaccard similarity > 0.85)
 * Layer 4: Key phrase overlap (> 70% overlap)
 */
@Injectable()
export class DeduplicationService {
  private readonly logger = new Logger(DeduplicationService.name);

  constructor(private readonly articleRepository: ArticleRepository) {}

  /**
   * Generate SHA-256 content hash
   */
  generateContentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Normalize title for fuzzy matching
   * Lowercase, remove punctuation, collapse whitespace
   */
  normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract key phrases from content
   * Simple extraction: 2-3 word phrases from title and first paragraph
   */
  extractKeyPhrases(title: string, content: string): string[] {
    const text = `${title} ${content.substring(0, 500)}`.toLowerCase();
    const words = text.split(/\s+/).filter((w) => w.length > 3);

    const phrases: Set<string> = new Set();

    // Extract 2-word phrases
    for (let i = 0; i < words.length - 1; i++) {
      phrases.add(`${words[i]} ${words[i + 1]}`);
    }

    // Extract 3-word phrases
    for (let i = 0; i < words.length - 2; i++) {
      phrases.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
    }

    // Return top 20 phrases (sorted by length, preferring longer)
    return Array.from(phrases)
      .sort((a, b) => b.length - a.length)
      .slice(0, 20);
  }

  /**
   * Generate fingerprint hash from key phrases
   */
  generateFingerprintHash(keyPhrases: string[]): string {
    const sorted = [...keyPhrases].sort().join('|');
    return createHash('sha256').update(sorted).digest('hex');
  }

  /**
   * Calculate Jaccard similarity between two sets of words
   */
  calculateJaccardSimilarity(set1: string[], set2: string[]): number {
    const s1 = new Set(set1);
    const s2 = new Set(set2);

    const intersection = new Set([...s1].filter((x) => s2.has(x)));
    const union = new Set([...s1, ...s2]);

    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }

  /**
   * Calculate phrase overlap percentage
   */
  calculatePhraseOverlap(phrases1: string[], phrases2: string[]): number {
    const set1 = new Set(phrases1);
    const set2 = new Set(phrases2);

    const intersection = [...set1].filter((x) => set2.has(x));
    const smaller = Math.min(set1.size, set2.size);

    if (smaller === 0) return 0;
    return intersection.length / smaller;
  }

  /**
   * Check for duplicates using 4-layer deduplication
   *
   * @returns DeduplicationResult with duplicate type and existing article if found
   */
  async checkDuplicate(
    organizationSlug: string,
    sourceId: string,
    contentHash: string,
    title: string,
    content: string,
    config: typeof DEFAULT_DEDUP_CONFIG = DEFAULT_DEDUP_CONFIG,
  ): Promise<DeduplicationResult> {
    // Layer 1: Exact hash match (within any source for this org)
    const existingByHash = await this.articleRepository.findByContentHash(
      organizationSlug,
      contentHash,
    );

    if (existingByHash) {
      const isDifferentSource = existingByHash.source_id !== sourceId;
      return {
        is_duplicate: true,
        duplicate_type: isDifferentSource ? 'cross_source' : 'exact',
        existing_article_id: existingByHash.id,
      };
    }

    // Layer 2: Cross-source hash check (explicitly check other sources)
    if (config.cross_source_dedup) {
      const hashExistsElsewhere =
        await this.articleRepository.checkContentHashExists(
          organizationSlug,
          contentHash,
          sourceId,
        );

      if (hashExistsElsewhere) {
        return {
          is_duplicate: true,
          duplicate_type: 'cross_source',
        };
      }
    }

    // Layer 3 & 4: Fuzzy matching
    if (config.fuzzy_dedup_enabled && title) {
      const normalizedTitle = this.normalizeTitle(title);
      const titleWords = normalizedTitle.split(' ');
      const keyPhrases = this.extractKeyPhrases(title, content);

      // Get recent fingerprints for comparison
      const recentFingerprints =
        await this.articleRepository.findRecentFingerprints(
          organizationSlug,
          config.dedup_hours_back,
          100,
        );

      // Layer 3: Fuzzy title matching
      for (const fingerprint of recentFingerprints) {
        if (!fingerprint.title_normalized) continue;

        const existingTitleWords = fingerprint.title_normalized.split(' ');
        const similarity = this.calculateJaccardSimilarity(
          titleWords,
          existingTitleWords,
        );

        if (similarity >= config.title_similarity_threshold) {
          return {
            is_duplicate: true,
            duplicate_type: 'fuzzy_title',
            existing_article_id: fingerprint.article_id,
            similarity_score: similarity,
          };
        }
      }

      // Layer 4: Key phrase overlap
      if (keyPhrases.length > 0) {
        const overlappingArticles =
          await this.articleRepository.findByPhraseOverlap(
            organizationSlug,
            keyPhrases,
            config.dedup_hours_back,
            50,
          );

        for (const article of overlappingArticles) {
          if (!article.key_phrases) continue;

          const overlap = this.calculatePhraseOverlap(
            keyPhrases,
            article.key_phrases,
          );

          if (overlap >= config.phrase_overlap_threshold) {
            return {
              is_duplicate: true,
              duplicate_type: 'phrase_overlap',
              existing_article_id: article.article_id,
              similarity_score: overlap,
            };
          }
        }
      }
    }

    return { is_duplicate: false };
  }
}
