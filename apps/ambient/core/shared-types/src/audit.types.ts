export type AuditEventType =
  | 'message_sent'
  | 'message_received'
  | 'message_rejected'
  | 'negotiation_proposed'
  | 'negotiation_agreed'
  | 'negotiation_rejected'
  | 'payment_created'
  | 'payment_verified'
  | 'payment_settled'
  | 'trust_evaluated'
  | 'trust_updated'
  | 'identity_verified'
  | 'identity_failed'
  | 'signature_verified'
  | 'signature_failed'
  | 'replay_detected'
  | 'schema_validation_failed'
  | 'key_rotated'
  | 'config_changed';

export interface AuditEntry {
  sequence: number;
  timestamp: string;            // ISO 8601
  eventType: AuditEventType;
  agentId: string;
  messageId?: string;
  layer?: string;               // Which protocol layer
  provider?: string;            // Which provider
  data: Record<string, unknown>;
  entryHash: string;            // SHA-256 of this entry's content
  previousHash: string;         // Hash of the previous entry (chain link)
}

export interface AuditChainStatus {
  length: number;
  headHash: string;
  tailHash: string;
  verified: boolean;
  brokenAt?: number;            // Sequence number where chain breaks
}

export interface AuditQueryOptions {
  fromSequence?: number;
  toSequence?: number;
  eventTypes?: AuditEventType[];
  agentId?: string;
  layer?: string;
  limit?: number;
}
