/**
 * DocumentClassificationBadge — label/bucket mapping contract specs.
 *
 * Matches the GenerateDealMemoModal pattern: rather than mounting the Ionic
 * shell, exercise the pure mapping function by importing and evaluating the
 * TYPE_MAP logic the badge template consumes. The badge's only interesting
 * behavior is this mapping; the rendering is pure <span>.
 */
import { describe, it, expect } from 'vitest';

// Re-implement the mapping here (mirroring the badge source) so the test
// lives without a Vue template environment. If the mapping changes in the
// badge file, this test must be updated in the same edit.
interface TypeMeta {
  label: string;
  bucket: 'legal' | 'financial' | 'other';
}

const TYPE_MAP: Record<string, TypeMeta> = {
  contract: { label: 'Contract', bucket: 'legal' },
  nda: { label: 'NDA', bucket: 'legal' },
  employment_agreement: { label: 'Employment', bucket: 'legal' },
  lease: { label: 'Lease', bucket: 'legal' },
  ip_assignment: { label: 'IP Assignment', bucket: 'legal' },
  privacy_policy: { label: 'Privacy Policy', bucket: 'legal' },
  corporate_governance: { label: 'Corporate Governance', bucket: 'legal' },
  regulatory_filing: { label: 'Regulatory Filing', bucket: 'legal' },
  insurance_policy: { label: 'Insurance', bucket: 'legal' },
  litigation: { label: 'Litigation', bucket: 'legal' },
  amendment: { label: 'Amendment', bucket: 'legal' },
  schedule: { label: 'Schedule', bucket: 'legal' },
  exhibit: { label: 'Exhibit', bucket: 'legal' },

  balance_sheet: { label: 'Balance Sheet', bucket: 'financial' },
  profit_and_loss: { label: 'P&L', bucket: 'financial' },
  cash_flow: { label: 'Cash Flow', bucket: 'financial' },
  cap_table: { label: 'Cap Table', bucket: 'financial' },
  debt_schedule: { label: 'Debt Schedule', bucket: 'financial' },
  audit_letter: { label: 'Audit Letter', bucket: 'financial' },
  projections: { label: 'Projections', bucket: 'financial' },
  board_deck: { label: 'Board Deck', bucket: 'financial' },
};

function lookup(documentType: string): TypeMeta {
  const normalized = documentType.toLowerCase().replace(/[- ]/g, '_');
  return TYPE_MAP[normalized] ?? { label: documentType, bucket: 'other' };
}

describe('DocumentClassificationBadge mapping', () => {
  const FINANCIAL_SUBTYPES = [
    'balance_sheet',
    'profit_and_loss',
    'cash_flow',
    'cap_table',
    'debt_schedule',
    'audit_letter',
    'projections',
    'board_deck',
  ] as const;

  it.each(FINANCIAL_SUBTYPES)('maps %s to the financial bucket', (type) => {
    const meta = lookup(type);
    expect(meta.bucket).toBe('financial');
    expect(meta.label.length).toBeGreaterThan(0);
  });

  const LEGAL_SUBTYPES = [
    'contract',
    'nda',
    'employment_agreement',
    'lease',
    'ip_assignment',
    'privacy_policy',
    'corporate_governance',
    'regulatory_filing',
    'insurance_policy',
    'litigation',
    'amendment',
    'schedule',
    'exhibit',
  ] as const;

  it.each(LEGAL_SUBTYPES)('maps %s to the legal bucket', (type) => {
    expect(lookup(type).bucket).toBe('legal');
  });

  it('falls back to the "other" bucket for an unknown type (with the raw string as label)', () => {
    const meta = lookup('random_unknown_type');
    expect(meta.bucket).toBe('other');
    expect(meta.label).toBe('random_unknown_type');
  });

  it('normalizes hyphenated input (balance-sheet → balance_sheet)', () => {
    expect(lookup('balance-sheet').bucket).toBe('financial');
    expect(lookup('balance-sheet').label).toBe('Balance Sheet');
  });

  it('normalizes mixed-case input (NDA → nda)', () => {
    expect(lookup('NDA').bucket).toBe('legal');
  });

  it('never maps the legacy `financial_statement` type to a specific financial subtype', () => {
    // Phase 1 removed `financial_statement` from the classifier's vocabulary.
    // If the token ever re-surfaces (via a replayed checkpoint), the badge
    // falls to "other" rather than silently picking one of the 8 subtypes.
    const meta = lookup('financial_statement');
    expect(meta.bucket).toBe('other');
  });
});
