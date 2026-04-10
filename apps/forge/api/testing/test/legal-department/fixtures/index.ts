/**
 * Legal Department Test Fixtures — Shared Document Library
 *
 * Professional-grade legal documents for E2E testing of both
 * document-onboarding and contract-review workflows.
 *
 * Each fixture exports:
 * - `text`: The full document content (uploadable as-is)
 * - `filename`: Suggested filename for upload
 * - `mimeType`: MIME type for upload
 * - `documentType`: Expected classification type
 * - `parties`: Known parties with names, types, roles
 * - `dates`: Known dates for extraction validation
 * - `signers`: Known signatories
 * - `knownRisks`: (contracts only) Expected risk findings for calibration
 *
 * Usage:
 *   import { MUTUAL_NDA } from '../fixtures';
 *   const buffer = Buffer.from(MUTUAL_NDA.text, 'utf-8');
 */

// ── Contracts (document-onboarding + contract-review) ──────────────────

export { MUTUAL_NDA } from './contracts/mutual-nda';
export { MASTER_SERVICE_AGREEMENT } from './contracts/master-service-agreement';
export { SOFTWARE_LICENSE_AGREEMENT } from './contracts/software-license-agreement';
export { COMMERCIAL_LEASE } from './contracts/commercial-lease';

// ── Employment (document-onboarding + contract-review) ─────────────────

export { EMPLOYMENT_AGREEMENT } from './employment/employment-agreement';

// ── Privacy & Data Protection (document-onboarding + contract-review) ──

export { DATA_PROCESSING_AGREEMENT } from './privacy/data-processing-agreement';

// ── Litigation (document-onboarding only — not contracts) ──────────────

export { COMPLAINT_BREACH_OF_CONTRACT } from './litigation/complaint-breach-of-contract';

// ── Corporate Governance (document-onboarding only — not contracts) ────

export { BOARD_RESOLUTION } from './corporate/board-resolution';

// ── Convenience collections ────────────────────────────────────────────

/** All fixtures that are contracts — suitable for contract-review workflow */
export const CONTRACT_FIXTURES = [
  'MUTUAL_NDA',
  'MASTER_SERVICE_AGREEMENT',
  'SOFTWARE_LICENSE_AGREEMENT',
  'COMMERCIAL_LEASE',
  'EMPLOYMENT_AGREEMENT',
  'DATA_PROCESSING_AGREEMENT',
] as const;

/** All fixtures — suitable for document-onboarding workflow */
export const ALL_FIXTURES = [
  ...CONTRACT_FIXTURES,
  'COMPLAINT_BREACH_OF_CONTRACT',
  'BOARD_RESOLUTION',
] as const;

/** Fixtures that should NOT go through contract-review (they're not contracts) */
export const NON_CONTRACT_FIXTURES = [
  'COMPLAINT_BREACH_OF_CONTRACT',
  'BOARD_RESOLUTION',
] as const;
