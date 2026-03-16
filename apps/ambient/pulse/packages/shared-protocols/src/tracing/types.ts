import { ProvenanceLabel } from '@agent-communication/shared-types';

export interface PipelineStep {
  step: number;
  label: string;                    // "Raw Payload", "After Signing", "After Encryption", etc.
  layer: string;                    // "identity", "encryption", "transport", "trust", etc.
  provider: string;                 // "oauth-jwt", "envelope", "a2a-jsonrpc", etc.
  data: Record<string, unknown>;    // The actual data at this stage (snapshot)
  metadata?: {                      // Optional layer-specific info
    signatureValid?: boolean;
    trustScore?: number;
    trustLevel?: string;
    encryptionAlgorithm?: string;
    rulesChecked?: number;
    rulesPassed?: number;
    paymentAmount?: number;
    paymentCurrency?: string;
    circuitBreakerState?: string;
    provenance?: ProvenanceLabel;   // Provenance declaration for this step
    [key: string]: unknown;
  };
  provenance?: ProvenanceLabel;     // Top-level provenance for the step
  timestamp: string;                // ISO timestamp when this step executed
  durationMs: number;               // How long this step took
}

export interface PipelineTrace {
  traceId: string;                  // Unique trace ID (UUID)
  messageId: string;                // Associated message ID
  source: string;                   // Source org/agent
  target: string;                   // Target org/agent
  method: string;                   // JSON-RPC method or endpoint
  steps: PipelineStep[];            // Ordered list of transformation steps
  totalDurationMs: number;          // Sum of all step durations
  startedAt: string;                // ISO timestamp
  completedAt: string;              // ISO timestamp
  providersUsed: string[];          // List of all providers exercised
}
