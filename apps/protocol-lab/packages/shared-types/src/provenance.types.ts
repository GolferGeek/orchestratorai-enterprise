export type ProvenanceState = 'executed-live' | 'verified' | 'pending' | 'rejected';

export interface ProvenanceLabel {
  state: ProvenanceState;
  sourceArtifactId?: string;  // txHash, correlationId, rejectionId, etc.
  sourceArtifactType?: string;  // 'transaction', 'callback', 'security-rejection', 'audit-entry'
  verifiedAt?: string;  // ISO timestamp when verification occurred
  rejectionReason?: string;  // Only when state === 'rejected'
  rejectionCode?: number;  // JSON-RPC error code when rejected
}

/**
 * Factory that creates a ProvenanceLabel with validation.
 *
 * Rules:
 * - 'verified' state REQUIRES sourceArtifactId — throws if absent
 * - 'rejected' state ALLOWS rejectionReason and rejectionCode
 * - 'executed-live' is the default for steps that run in real-time
 * - 'pending' state requires no additional fields
 */
export function createProvenance(state: ProvenanceState, opts?: Partial<ProvenanceLabel>): ProvenanceLabel {
  if (state === 'verified') {
    const artifactId = opts?.sourceArtifactId;
    if (!artifactId) {
      throw new Error(
        "createProvenance: 'verified' state requires a sourceArtifactId linking to the backing evidence",
      );
    }
  }

  const label: ProvenanceLabel = { state };

  if (opts?.sourceArtifactId !== undefined) label.sourceArtifactId = opts.sourceArtifactId;
  if (opts?.sourceArtifactType !== undefined) label.sourceArtifactType = opts.sourceArtifactType;
  if (opts?.verifiedAt !== undefined) label.verifiedAt = opts.verifiedAt;
  if (opts?.rejectionReason !== undefined) label.rejectionReason = opts.rejectionReason;
  if (opts?.rejectionCode !== undefined) label.rejectionCode = opts.rejectionCode;

  return label;
}

/**
 * Returns true only when the label is in 'verified' state AND has a sourceArtifactId.
 * A 'verified' label without an artifact ID is considered incomplete and returns false.
 */
export function isVerifiedProvenance(label: ProvenanceLabel): boolean {
  return label.state === 'verified' && !!label.sourceArtifactId;
}
