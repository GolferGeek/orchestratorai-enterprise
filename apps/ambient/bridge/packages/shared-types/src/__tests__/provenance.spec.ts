import { createProvenance, isVerifiedProvenance, ProvenanceLabel } from '../provenance.types';

describe('createProvenance', () => {
  it('creates executed-live state with no artifact required', () => {
    const label = createProvenance('executed-live');
    expect(label.state).toBe('executed-live');
    expect(label.sourceArtifactId).toBeUndefined();
  });

  it('creates verified state with sourceArtifactId provided', () => {
    const txHash = 'lnbc1abc123def456';
    const label = createProvenance('verified', {
      sourceArtifactId: txHash,
      sourceArtifactType: 'transaction',
    });
    expect(label.state).toBe('verified');
    expect(label.sourceArtifactId).toBe(txHash);
    expect(label.sourceArtifactType).toBe('transaction');
  });

  it('throws when verified state is requested without sourceArtifactId', () => {
    expect(() => createProvenance('verified')).toThrow(
      "createProvenance: 'verified' state requires a sourceArtifactId linking to the backing evidence",
    );
  });

  it('throws when verified state has empty sourceArtifactId', () => {
    expect(() => createProvenance('verified', { sourceArtifactId: '' })).toThrow(
      "createProvenance: 'verified' state requires a sourceArtifactId",
    );
  });

  it('creates pending state', () => {
    const label = createProvenance('pending');
    expect(label.state).toBe('pending');
    expect(label.sourceArtifactId).toBeUndefined();
    expect(label.rejectionReason).toBeUndefined();
  });

  it('creates rejected state with rejectionReason and rejectionCode', () => {
    const label = createProvenance('rejected', {
      rejectionReason: 'nonce already used',
      rejectionCode: -32600,
    });
    expect(label.state).toBe('rejected');
    expect(label.rejectionReason).toBe('nonce already used');
    expect(label.rejectionCode).toBe(-32600);
  });

  it('creates rejected state without rejectionReason (not required)', () => {
    const label = createProvenance('rejected');
    expect(label.state).toBe('rejected');
    expect(label.rejectionReason).toBeUndefined();
  });

  it('preserves optional opts fields when provided', () => {
    const verifiedAt = '2026-03-11T10:00:00.000Z';
    const label = createProvenance('verified', {
      sourceArtifactId: 'txn-001',
      sourceArtifactType: 'audit-entry',
      verifiedAt,
    });
    expect(label.verifiedAt).toBe(verifiedAt);
    expect(label.sourceArtifactType).toBe('audit-entry');
  });
});

describe('isVerifiedProvenance', () => {
  it('returns true for verified state with sourceArtifactId', () => {
    const label: ProvenanceLabel = {
      state: 'verified',
      sourceArtifactId: 'lnbc1abc123',
    };
    expect(isVerifiedProvenance(label)).toBe(true);
  });

  it('returns false for verified state without sourceArtifactId', () => {
    const label: ProvenanceLabel = { state: 'verified' };
    expect(isVerifiedProvenance(label)).toBe(false);
  });

  it('returns false for executed-live state', () => {
    const label: ProvenanceLabel = { state: 'executed-live' };
    expect(isVerifiedProvenance(label)).toBe(false);
  });

  it('returns false for pending state', () => {
    const label: ProvenanceLabel = { state: 'pending' };
    expect(isVerifiedProvenance(label)).toBe(false);
  });

  it('returns false for rejected state', () => {
    const label: ProvenanceLabel = {
      state: 'rejected',
      rejectionReason: 'invalid signature',
      rejectionCode: -32600,
    };
    expect(isVerifiedProvenance(label)).toBe(false);
  });
});

describe('Artifact linkage', () => {
  it('payment step links to transaction hash (txHash)', () => {
    const txHash = 'lnbc1abc000def111';
    const label = createProvenance('verified', {
      sourceArtifactId: txHash,
      sourceArtifactType: 'transaction',
    });
    expect(label.sourceArtifactId).toBe(txHash);
    expect(label.sourceArtifactType).toBe('transaction');
    expect(isVerifiedProvenance(label)).toBe(true);
  });

  it('callback step links to correlation ID', () => {
    const correlationId = 'corr-2026-abc123';
    const label = createProvenance('verified', {
      sourceArtifactId: correlationId,
      sourceArtifactType: 'callback',
    });
    expect(label.sourceArtifactId).toBe(correlationId);
    expect(label.sourceArtifactType).toBe('callback');
    expect(isVerifiedProvenance(label)).toBe(true);
  });
});
