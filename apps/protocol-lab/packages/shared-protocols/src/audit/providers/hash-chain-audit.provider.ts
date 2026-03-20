/**
 * HashChainAuditProvider
 *
 * A production-grade, append-only audit trail backed by a cryptographic
 * hash chain.
 *
 * Chain construction
 * ------------------
 * - The chain starts with a genesis hash: SHA-256("GENESIS").
 * - Each entry's signing payload is the canonical (sorted-key) JSON of:
 *     { sequence, timestamp, eventType, agentId, messageId, layer,
 *       provider, data, previousHash }
 *   The `entryHash` is SHA-256(signingPayload).
 * - `previousHash` of entry[n] is `entryHash` of entry[n-1], or the genesis
 *   hash for the first entry.
 *
 * Tamper evidence
 * ---------------
 * Modifying any field of any entry changes that entry's hash, which breaks
 * the link to the next entry, which `verifyChain()` will detect by walking
 * every link.
 *
 * Thread-safety
 * -------------
 * Node.js is single-threaded; Map / Array mutations within a single
 * synchronous call are therefore atomic with respect to the event loop.
 * `append()` is synchronous and all mutations complete before the event loop
 * can yield.
 */

import * as crypto from 'crypto';
import {
  AuditEntry,
  AuditChainStatus,
  AuditQueryOptions,
  AuditEventType,
} from '@agent-communication/shared-types';
import { IAuditProvider } from '../audit.interface';

/** SHA-256("GENESIS") — the anchor hash of every fresh chain. */
const GENESIS_INPUT = 'GENESIS';

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Produces a deterministic JSON serialisation with sorted object keys so
 * that the same logical content always produces the same hash regardless of
 * property-insertion order.
 */
function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + (obj as unknown[]).map(canonicalJson).join(',') + ']';
  }

  const sorted = Object.keys(obj as Record<string, unknown>)
    .sort()
    .map((k) => JSON.stringify(k) + ':' + canonicalJson((obj as Record<string, unknown>)[k]))
    .join(',');

  return '{' + sorted + '}';
}

/**
 * The fields that are hashed for a given entry.  `entryHash` is excluded
 * from its own hash input (otherwise it would be self-referential).
 * Optional fields are included only when defined so that their presence or
 * absence is part of the hash.
 */
interface EntryHashPayload {
  sequence: number;
  timestamp: string;
  eventType: AuditEventType;
  agentId: string;
  messageId?: string;
  layer?: string;
  provider?: string;
  data: Record<string, unknown>;
  previousHash: string;
}

function buildHashPayload(
  partial: Omit<AuditEntry, 'entryHash'>,
): EntryHashPayload {
  const payload: EntryHashPayload = {
    sequence: partial.sequence,
    timestamp: partial.timestamp,
    eventType: partial.eventType,
    agentId: partial.agentId,
    data: partial.data,
    previousHash: partial.previousHash,
  };

  // Include optional fields only when present.
  if (partial.messageId !== undefined) {
    payload.messageId = partial.messageId;
  }
  if (partial.layer !== undefined) {
    payload.layer = partial.layer;
  }
  if (partial.provider !== undefined) {
    payload.provider = partial.provider;
  }

  return payload;
}

function computeEntryHash(partial: Omit<AuditEntry, 'entryHash'>): string {
  return sha256(canonicalJson(buildHashPayload(partial)));
}

export class HashChainAuditProvider implements IAuditProvider {
  readonly providerId = 'hash-chain';

  private readonly chain: AuditEntry[] = [];
  private readonly genesisHash: string;
  private latestHash: string;

  constructor() {
    this.genesisHash = sha256(GENESIS_INPUT);
    this.latestHash = this.genesisHash;
  }

  // ---------------------------------------------------------------------------
  // IAuditProvider
  // ---------------------------------------------------------------------------

  append(
    entry: Omit<AuditEntry, 'sequence' | 'entryHash' | 'previousHash'>,
  ): AuditEntry {
    const sequence = this.chain.length; // 0-based; first real entry = 0
    const previousHash = this.latestHash;

    const partial: Omit<AuditEntry, 'entryHash'> = {
      ...entry,
      sequence,
      previousHash,
    };

    const entryHash = computeEntryHash(partial);

    const committed: AuditEntry = { ...partial, entryHash };

    // These two mutations must be atomic — no await between them.
    this.chain.push(committed);
    this.latestHash = entryHash;

    return committed;
  }

  query(options: AuditQueryOptions = {}): AuditEntry[] {
    let results = this.chain as readonly AuditEntry[];

    if (options.fromSequence !== undefined) {
      results = results.filter((e) => e.sequence >= (options.fromSequence as number));
    }

    if (options.toSequence !== undefined) {
      results = results.filter((e) => e.sequence <= (options.toSequence as number));
    }

    if (options.eventTypes && options.eventTypes.length > 0) {
      const set = new Set<AuditEventType>(options.eventTypes);
      results = results.filter((e) => set.has(e.eventType));
    }

    if (options.agentId !== undefined) {
      const agentId = options.agentId;
      results = results.filter((e) => e.agentId === agentId);
    }

    if (options.layer !== undefined) {
      const layer = options.layer;
      results = results.filter((e) => e.layer === layer);
    }

    if (options.limit !== undefined && options.limit > 0) {
      results = results.slice(0, options.limit);
    }

    // Return a shallow copy so callers cannot mutate the internal array.
    return [...results];
  }

  verifyChain(): AuditChainStatus {
    if (this.chain.length === 0) {
      return {
        length: 0,
        headHash: this.genesisHash,
        tailHash: this.genesisHash,
        verified: true,
      };
    }

    let expectedPreviousHash = this.genesisHash;

    for (const entry of this.chain) {
      // Verify the previousHash linkage.
      if (entry.previousHash !== expectedPreviousHash) {
        return {
          length: this.chain.length,
          headHash: this.chain[0].entryHash,
          tailHash: this.chain[this.chain.length - 1].entryHash,
          verified: false,
          brokenAt: entry.sequence,
        };
      }

      // Recompute and verify entryHash.
      const recomputed = computeEntryHash({
        sequence: entry.sequence,
        timestamp: entry.timestamp,
        eventType: entry.eventType,
        agentId: entry.agentId,
        messageId: entry.messageId,
        layer: entry.layer,
        provider: entry.provider,
        data: entry.data,
        previousHash: entry.previousHash,
      });

      if (recomputed !== entry.entryHash) {
        return {
          length: this.chain.length,
          headHash: this.chain[0].entryHash,
          tailHash: this.chain[this.chain.length - 1].entryHash,
          verified: false,
          brokenAt: entry.sequence,
        };
      }

      expectedPreviousHash = entry.entryHash;
    }

    return {
      length: this.chain.length,
      headHash: this.chain[0].entryHash,
      tailHash: this.chain[this.chain.length - 1].entryHash,
      verified: true,
    };
  }

  getLatestHash(): string {
    return this.latestHash;
  }

  getLength(): number {
    return this.chain.length;
  }
}
