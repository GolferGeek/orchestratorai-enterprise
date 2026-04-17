/**
 * Phase 4 unit specs for DiscoveryReviewView.vue — logic functions.
 *
 * Tests the pure helper functions used by the Privilege Log and Production Set
 * tabs, following the pattern of CreateDiscoveryReviewModal.spec.ts (logic only,
 * no full Vue component mount needed).
 *
 * Verifies:
 *  - formatPrivilegeType produces correct labels
 *  - formatBates generates correct Bates numbers
 *  - getDocName / getDocType resolve from documentIndex
 *  - exportCsv generates correct CSV rows with and without batesPrefix
 *  - finalStats computed reflects productionSetSize, privilegeCount, corrections
 */
import { describe, it, expect } from 'vitest';

// ── Pure helpers mirrored from DiscoveryReviewView.vue ────────────────────────

function formatPrivilegeType(type: string): string {
  switch (type) {
    case 'attorney_client': return 'Attorney-Client';
    case 'work_product': return 'Work Product';
    case 'both': return 'Both';
    default: return '—';
  }
}

function formatBates(index: number, prefix: string | null): string {
  const p = prefix ?? '';
  return `${p}${String(index + 1).padStart(7, '0')}`;
}

interface DocumentIndexEntry {
  documentId: string;
  name: string;
  documentType: string;
}

function getDocName(docId: string, documentIndex: DocumentIndexEntry[]): string {
  return documentIndex.find((e) => e.documentId === docId)?.name ?? docId;
}

function getDocType(docId: string, documentIndex: DocumentIndexEntry[]): string {
  return documentIndex.find((e) => e.documentId === docId)?.documentType ?? '—';
}

interface ReviewStatistics {
  productionSetSize?: number;
  privilegeCount?: number;
  humanCorrectionCount?: number;
}

interface PrivilegeLogEntry {
  documentId: string;
}

interface DiscoveryPayload {
  reviewStatistics: ReviewStatistics;
  productionSet?: string[];
  privilegeLog?: PrivilegeLogEntry[];
}

function computeFinalStats(dp: DiscoveryPayload | null) {
  return {
    productionSetSize: dp?.reviewStatistics.productionSetSize ?? dp?.productionSet?.length ?? 0,
    privilegeCount: dp?.reviewStatistics.privilegeCount ?? dp?.privilegeLog?.length ?? 0,
    humanCorrectionCount: dp?.reviewStatistics.humanCorrectionCount ?? 0,
  };
}

function buildCsvRows(
  productionSet: string[],
  documentIndex: DocumentIndexEntry[],
  batesPrefix: string | null,
): string[] {
  const header = batesPrefix
    ? 'Bates #,Document ID,Document Name,Type'
    : 'Document ID,Document Name,Type';
  const rows: string[] = [header];
  productionSet.forEach((docId, index) => {
    const name = getDocName(docId, documentIndex).replace(/,/g, ' ');
    const type = getDocType(docId, documentIndex).replace(/,/g, ' ');
    if (batesPrefix) {
      rows.push(`${formatBates(index, batesPrefix)},${docId},${name},${type}`);
    } else {
      rows.push(`${docId},${name},${type}`);
    }
  });
  return rows;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const DOCUMENT_INDEX: DocumentIndexEntry[] = [
  { documentId: 'd1', name: 'contract.pdf', documentType: 'contract' },
  { documentId: 'd2', name: 'email.eml', documentType: 'email' },
  { documentId: 'd4', name: 'report.pdf', documentType: 'presentation' },
];

describe('formatPrivilegeType', () => {
  it('returns Attorney-Client for attorney_client', () => {
    expect(formatPrivilegeType('attorney_client')).toBe('Attorney-Client');
  });
  it('returns Work Product for work_product', () => {
    expect(formatPrivilegeType('work_product')).toBe('Work Product');
  });
  it('returns Both for both', () => {
    expect(formatPrivilegeType('both')).toBe('Both');
  });
  it('returns — for unknown types', () => {
    expect(formatPrivilegeType('none')).toBe('—');
    expect(formatPrivilegeType('')).toBe('—');
  });
});

describe('formatBates', () => {
  it('pads to 7 digits with prefix', () => {
    expect(formatBates(0, 'CORP-')).toBe('CORP-0000001');
    expect(formatBates(9, 'CORP-')).toBe('CORP-0000010');
    expect(formatBates(999999, 'CORP-')).toBe('CORP-1000000');
  });

  it('works with no prefix', () => {
    expect(formatBates(0, null)).toBe('0000001');
    expect(formatBates(4, '')).toBe('0000005');
  });
});

describe('getDocName / getDocType', () => {
  it('resolves name from documentIndex', () => {
    expect(getDocName('d1', DOCUMENT_INDEX)).toBe('contract.pdf');
    expect(getDocName('d2', DOCUMENT_INDEX)).toBe('email.eml');
  });

  it('falls back to documentId when not in index', () => {
    expect(getDocName('unknown-id', DOCUMENT_INDEX)).toBe('unknown-id');
  });

  it('resolves type from documentIndex', () => {
    expect(getDocType('d1', DOCUMENT_INDEX)).toBe('contract');
    expect(getDocType('d4', DOCUMENT_INDEX)).toBe('presentation');
  });

  it('falls back to — for unknown type', () => {
    expect(getDocType('unknown-id', DOCUMENT_INDEX)).toBe('—');
  });
});

describe('computeFinalStats', () => {
  it('reads from reviewStatistics when available', () => {
    const dp: DiscoveryPayload = {
      reviewStatistics: {
        productionSetSize: 5,
        privilegeCount: 2,
        humanCorrectionCount: 3,
      },
      productionSet: ['d1'],
      privilegeLog: [],
    };
    const stats = computeFinalStats(dp);
    expect(stats.productionSetSize).toBe(5);
    expect(stats.privilegeCount).toBe(2);
    expect(stats.humanCorrectionCount).toBe(3);
  });

  it('falls back to array lengths when stats fields are absent', () => {
    const dp: DiscoveryPayload = {
      reviewStatistics: {},
      productionSet: ['d1', 'd2', 'd3'],
      privilegeLog: [{ documentId: 'd4' }],
    };
    const stats = computeFinalStats(dp);
    expect(stats.productionSetSize).toBe(3);
    expect(stats.privilegeCount).toBe(1);
    expect(stats.humanCorrectionCount).toBe(0);
  });

  it('returns zeros when payload is null', () => {
    const stats = computeFinalStats(null);
    expect(stats.productionSetSize).toBe(0);
    expect(stats.privilegeCount).toBe(0);
    expect(stats.humanCorrectionCount).toBe(0);
  });
});

describe('buildCsvRows (export logic)', () => {
  const productionSet = ['d1', 'd4'];

  it('generates header without Bates when no prefix', () => {
    const rows = buildCsvRows(productionSet, DOCUMENT_INDEX, null);
    expect(rows[0]).toBe('Document ID,Document Name,Type');
  });

  it('generates header with Bates when prefix provided', () => {
    const rows = buildCsvRows(productionSet, DOCUMENT_INDEX, 'ABC-');
    expect(rows[0]).toBe('Bates #,Document ID,Document Name,Type');
  });

  it('includes one row per document without Bates', () => {
    const rows = buildCsvRows(productionSet, DOCUMENT_INDEX, null);
    expect(rows).toHaveLength(3); // header + 2 docs
    expect(rows[1]).toBe('d1,contract.pdf,contract');
    expect(rows[2]).toBe('d4,report.pdf,presentation');
  });

  it('includes Bates number as first column when prefix provided', () => {
    const rows = buildCsvRows(productionSet, DOCUMENT_INDEX, 'CORP-');
    expect(rows[1]).toBe('CORP-0000001,d1,contract.pdf,contract');
    expect(rows[2]).toBe('CORP-0000002,d4,report.pdf,presentation');
  });

  it('escapes commas in document names by replacing with spaces', () => {
    const index: DocumentIndexEntry[] = [
      { documentId: 'd1', name: 'contract, amended.pdf', documentType: 'contract' },
    ];
    const rows = buildCsvRows(['d1'], index, null);
    expect(rows[1]).not.toContain('contract, amended');
    expect(rows[1]).toContain('contract  amended');
  });
});
