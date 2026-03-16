import {
  AuditEntry,
  AuditChainStatus,
  AuditQueryOptions,
} from '@agent-communication/shared-types';

/**
 * Interface for an append-only, hash-chained audit trail.
 *
 * Implementations must guarantee:
 * - Entries are never deleted or modified after being appended.
 * - Each entry's `entryHash` is the cryptographic hash of its own content
 *   (excluding `entryHash` itself).
 * - Each entry's `previousHash` equals the `entryHash` of the immediately
 *   preceding entry, forming a tamper-evident hash chain.
 * - `verifyChain()` is the authoritative mechanism for detecting tampering.
 */
export interface IAuditProvider {
  readonly providerId: string;

  /**
   * Appends a new entry to the chain.  The implementation assigns the
   * `sequence`, `entryHash`, and `previousHash` fields; the caller supplies
   * everything else.
   *
   * @returns The fully formed AuditEntry as stored (including hash fields).
   */
  append(
    entry: Omit<AuditEntry, 'sequence' | 'entryHash' | 'previousHash'>,
  ): AuditEntry;

  /**
   * Returns entries matching the given query options.  If no options are
   * provided the entire chain is returned in ascending sequence order.
   */
  query(options?: AuditQueryOptions): AuditEntry[];

  /**
   * Walks the entire chain, recomputes every hash, and verifies every link.
   * Returns a status object describing the result and, on failure, the
   * sequence number where the chain first breaks.
   */
  verifyChain(): AuditChainStatus;

  /**
   * Returns the `entryHash` of the most recently appended entry, or the
   * genesis hash if no entries have been appended yet.
   */
  getLatestHash(): string;

  /** Returns the total number of entries in the chain (not counting genesis). */
  getLength(): number;
}
