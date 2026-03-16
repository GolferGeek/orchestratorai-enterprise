import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import {
  SignalFingerprint,
  CreateSignalFingerprintData,
  SignalFingerprintCandidate,
} from '../interfaces/signal-fingerprint.interface';

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: SupabaseError;
};

/**
 * SignalFingerprintRepository - Manages signal fingerprints for fuzzy deduplication
 *
 * Fingerprints enable Layer 3 (fuzzy title matching) and Layer 4 (key phrase overlap)
 * deduplication strategies as specified in the Financial Asset Predictor PRD.
 */
@Injectable()
export class SignalFingerprintRepository {
  private readonly logger = new Logger(SignalFingerprintRepository.name);
  private readonly schema = 'prediction';
  private readonly table = 'signal_fingerprints';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Create a fingerprint for a signal
   */
  async create(data: CreateSignalFingerprintData): Promise<SignalFingerprint> {
    const { data: result, error } = (await this.db
      .from(this.schema, this.table)
      .insert({
        signal_id: data.signal_id,
        target_id: data.target_id,
        title_normalized: data.title_normalized,
        key_phrases: data.key_phrases,
        fingerprint_hash: data.fingerprint_hash,
      })
      .select()
      .single()) as SupabaseSelectResponse<SignalFingerprint>;

    if (error) {
      this.logger.error(
        `Failed to create signal fingerprint: ${error.message}`,
      );
      throw new Error(`Failed to create signal fingerprint: ${error.message}`);
    }

    if (!result) {
      throw new Error('Create succeeded but no fingerprint returned');
    }

    return result;
  }

  /**
   * Find fingerprint by signal ID
   */
  async findBySignalId(signalId: string): Promise<SignalFingerprint | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('signal_id', signalId)
      .single()) as SupabaseSelectResponse<SignalFingerprint>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to find fingerprint: ${error.message}`);
      throw new Error(`Failed to find fingerprint: ${error.message}`);
    }

    return data;
  }

  /**
   * Find fingerprint by fingerprint hash
   */
  async findByFingerprintHash(
    targetId: string,
    fingerprintHash: string,
  ): Promise<SignalFingerprint | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('target_id', targetId)
      .eq('fingerprint_hash', fingerprintHash)
      .single()) as SupabaseSelectResponse<SignalFingerprint>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to find fingerprint by hash: ${error.message}`);
      throw new Error(`Failed to find fingerprint by hash: ${error.message}`);
    }

    return data;
  }

  /**
   * Get recent fingerprints for a target
   * Used for Layer 3 (fuzzy title matching) candidate generation
   */
  async findRecentForTarget(
    targetId: string,
    hoursBack: number = 72,
    limit: number = 100,
  ): Promise<SignalFingerprint[]> {
    const { data, error } = (await this.db.rpc(
      'find_recent_signal_fingerprints',
      {
        p_target_id: targetId,
        p_hours_back: hoursBack,
        p_limit: limit,
      },
      this.schema,
    )) as SupabaseSelectListResponse<SignalFingerprint>;

    if (error) {
      // If function doesn't exist, fall back to direct query
      if (error.code === 'PGRST202') {
        this.logger.debug(
          'find_recent_signal_fingerprints function not found, using direct query',
        );
        return this.findRecentForTargetDirect(targetId, hoursBack, limit);
      }
      this.logger.error(`Failed to find recent fingerprints: ${error.message}`);
      throw new Error(`Failed to find recent fingerprints: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Direct query fallback for finding recent fingerprints
   */
  private async findRecentForTargetDirect(
    targetId: string,
    hoursBack: number,
    limit: number,
  ): Promise<SignalFingerprint[]> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hoursBack);

    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('target_id', targetId)
      .gte('created_at', cutoffDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(limit)) as SupabaseSelectListResponse<SignalFingerprint>;

    if (error) {
      this.logger.error(`Failed to find recent fingerprints: ${error.message}`);
      throw new Error(`Failed to find recent fingerprints: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Find fingerprints with overlapping key phrases
   * Used for Layer 4 (key phrase overlap) candidate generation
   */
  async findByPhraseOverlap(
    targetId: string,
    keyPhrases: string[],
    hoursBack: number = 72,
    limit: number = 50,
  ): Promise<SignalFingerprintCandidate[]> {
    const { data, error } = (await this.db.rpc(
      'find_signals_by_phrase_overlap',
      {
        p_target_id: targetId,
        p_key_phrases: keyPhrases,
        p_hours_back: hoursBack,
        p_limit: limit,
      },
      this.schema,
    )) as SupabaseSelectListResponse<SignalFingerprintCandidate>;

    if (error) {
      // If function doesn't exist, fall back to direct query
      if (error.code === 'PGRST202') {
        this.logger.debug(
          'find_signals_by_phrase_overlap function not found, using direct query',
        );
        return this.findByPhraseOverlapDirect(
          targetId,
          keyPhrases,
          hoursBack,
          limit,
        );
      }
      this.logger.error(
        `Failed to find fingerprints by phrase overlap: ${error.message}`,
      );
      throw new Error(
        `Failed to find fingerprints by phrase overlap: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Direct query fallback for finding fingerprints with phrase overlap
   */
  private async findByPhraseOverlapDirect(
    targetId: string,
    keyPhrases: string[],
    hoursBack: number,
    limit: number,
  ): Promise<SignalFingerprintCandidate[]> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hoursBack);

    // Use overlaps array operator
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('signal_id, title_normalized, key_phrases, created_at')
      .eq('target_id', targetId)
      .gte('created_at', cutoffDate.toISOString())
      .overlaps('key_phrases', keyPhrases)
      .order('created_at', { ascending: false })
      .limit(limit)) as SupabaseSelectListResponse<SignalFingerprint>;

    if (error) {
      this.logger.error(
        `Failed to find fingerprints by phrase overlap: ${error.message}`,
      );
      throw new Error(
        `Failed to find fingerprints by phrase overlap: ${error.message}`,
      );
    }

    // Calculate overlap counts in application code
    return (data ?? []).map((fp) => ({
      signal_id: fp.signal_id,
      title_normalized: fp.title_normalized,
      key_phrases: fp.key_phrases,
      overlap_count: fp.key_phrases.filter((kp) => keyPhrases.includes(kp))
        .length,
      created_at: fp.created_at,
    }));
  }

  /**
   * Delete fingerprint by signal ID
   */
  async deleteBySignalId(signalId: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('signal_id', signalId);

    if (error) {
      this.logger.error(`Failed to delete fingerprint: ${error.message}`);
      throw new Error(`Failed to delete fingerprint: ${error.message}`);
    }
  }

  /**
   * Delete old fingerprints to manage storage
   */
  async cleanupOldFingerprints(retentionDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .delete()
      .lt('created_at', cutoffDate.toISOString())
      .select('id')) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to cleanup old fingerprints: ${error.message}`);
      throw new Error(`Failed to cleanup old fingerprints: ${error.message}`);
    }

    const deletedRows = (data ?? []) as Array<{ id: string }>;
    const deletedCount = deletedRows.length;
    if (deletedCount > 0) {
      this.logger.debug(`Cleaned up ${deletedCount} old signal fingerprints`);
    }

    return deletedCount;
  }
}
