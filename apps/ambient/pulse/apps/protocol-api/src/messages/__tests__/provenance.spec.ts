import { ProtocolMessage } from '@agent-communication/shared-types';
import { ProvenanceLabel } from '@agent-communication/shared-types';

/**
 * These tests validate that ProtocolMessage can carry a ProvenanceLabel and that
 * the provenance field is preserved through simulated message recording (object
 * pass-through), matching how MessagesService.recordMessage works.
 */

function simulateRecordMessage(message: ProtocolMessage): ProtocolMessage {
  // Mirrors MessagesService.recordMessage — stores and returns the message as-is.
  return { ...message };
}

const baseMessage: Omit<ProtocolMessage, 'provenance'> = {
  id: 'test-msg-001',
  timestamp: '2026-03-11T10:00:00.000Z',
  source: 'fcs-financial',
  target: 'sunstream',
  method: 'compliance.validateLoan',
  protocol: {
    discovery: 'well-known',
    transport: 'a2a-jsonrpc',
    negotiation: 'capability-card',
    identity: 'oauth-jwt',
    payment: 'none',
    encryption: 'envelope',
    trust: 'reputation',
  },
  request: {
    jsonrpc: '2.0',
    id: 'req-001',
    method: 'compliance.validateLoan',
    params: { loanId: 'loan-abc123' },
  },
  response: {
    jsonrpc: '2.0',
    id: 'req-001',
    result: { approved: true, score: 92 },
  },
  timing: {
    sentAt: '2026-03-11T10:00:00.000Z',
    receivedAt: '2026-03-11T10:00:00.050Z',
    completedAt: '2026-03-11T10:00:00.120Z',
    durationMs: 120,
  },
  status: 'success',
};

describe('ProtocolMessage with provenance', () => {
  it('verified state includes sourceArtifactId', () => {
    const provenance: ProvenanceLabel = {
      state: 'verified',
      sourceArtifactId: 'lnbc1abc000def111',
      sourceArtifactType: 'transaction',
      verifiedAt: '2026-03-11T10:00:00.100Z',
    };
    const message: ProtocolMessage = { ...baseMessage, provenance };

    expect(message.provenance).toBeDefined();
    expect(message.provenance!.state).toBe('verified');
    expect(message.provenance!.sourceArtifactId).toBe('lnbc1abc000def111');
    expect(message.provenance!.sourceArtifactType).toBe('transaction');
  });

  it('rejected state includes rejectionReason', () => {
    const provenance: ProvenanceLabel = {
      state: 'rejected',
      rejectionReason: 'nonce already used — replay attack detected',
      rejectionCode: -32600,
    };
    const message: ProtocolMessage = { ...baseMessage, provenance };

    expect(message.provenance).toBeDefined();
    expect(message.provenance!.state).toBe('rejected');
    expect(message.provenance!.rejectionReason).toBe('nonce already used — replay attack detected');
    expect(message.provenance!.rejectionCode).toBe(-32600);
  });

  it('message without provenance has undefined provenance field', () => {
    const message: ProtocolMessage = { ...baseMessage };

    expect(message.provenance).toBeUndefined();
  });

  it('provenance field is preserved through message recording (object pass-through)', () => {
    const provenance: ProvenanceLabel = {
      state: 'verified',
      sourceArtifactId: 'pi_stripe_intent_abc123',
      sourceArtifactType: 'transaction',
      verifiedAt: '2026-03-11T10:00:00.100Z',
    };
    const original: ProtocolMessage = { ...baseMessage, provenance };
    const recorded = simulateRecordMessage(original);

    expect(recorded.provenance).toBeDefined();
    expect(recorded.provenance!.state).toBe('verified');
    expect(recorded.provenance!.sourceArtifactId).toBe('pi_stripe_intent_abc123');
    expect(recorded.provenance!.sourceArtifactType).toBe('transaction');
    expect(recorded.provenance!.verifiedAt).toBe('2026-03-11T10:00:00.100Z');
  });
});
