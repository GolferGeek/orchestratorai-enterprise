/**
 * Tests for validate-citations: registry minting + strict citation checks.
 */
import {
  buildCitationRegistry,
  CitationValidationError,
  validateCitations,
  type CitationRegistrySource,
} from './validate-citations';
import type {
  DocumentIndexEntry,
  RunningFindingsSummary,
  RiskMatrix,
  DealBreakerFlag,
} from '../../../due-diligence/due-diligence.types';
import type { CitationRef } from '../../deal-memo.types';

function makeDoc(
  documentId: string,
  name = 'doc',
  documentType = 'contract',
): DocumentIndexEntry {
  return {
    documentId,
    name,
    documentType,
    parties: [],
    date: null,
    summary: '',
    riskScore: null,
    status: 'complete',
    specialistsAssigned: [],
    specialistsCompleted: [],
  };
}

function makeFindings(
  specialistKey: string,
  findings: Array<{ docId: string; docName: string; text: string }>,
): RunningFindingsSummary {
  return {
    specialistKey,
    documentCount: findings.length,
    keyFindings: findings.map((f) => ({
      documentId: f.docId,
      documentName: f.docName,
      finding: f.text,
      severity: 'high',
      category: specialistKey,
    })),
    crossReferences: [],
    cumulativeRisks: [],
  };
}

function makeRiskMatrix(): RiskMatrix {
  return {
    cells: [
      {
        category: 'contractual',
        severity: 'high',
        count: 3,
        documentRefs: [],
      },
      {
        category: 'ip',
        severity: 'critical',
        count: 1,
        documentRefs: [],
      },
    ],
  };
}

function makeDealBreakers(): DealBreakerFlag[] {
  return [
    {
      finding: 'Missing IP assignment',
      category: 'ip',
      severity: 'critical',
      documentRefs: [],
      reasoning: '',
      recommendation: '',
    },
    {
      finding: 'Change of control blocker',
      category: 'contractual',
      severity: 'critical',
      documentRefs: [],
      reasoning: '',
      recommendation: '',
    },
  ];
}

function makeSource(): CitationRegistrySource {
  return {
    documentIndex: [makeDoc('doc-1', 'MSA.pdf'), makeDoc('doc-2', 'SPA.pdf')],
    runningFindings: {
      contract: makeFindings('contract', [
        { docId: 'doc-1', docName: 'MSA.pdf', text: 'MFN clause present' },
        { docId: 'doc-2', docName: 'SPA.pdf', text: 'Broad indemnity cap' },
      ]),
      ip: makeFindings('ip', [
        { docId: 'doc-1', docName: 'MSA.pdf', text: 'No IP assignment' },
      ]),
    },
    riskMatrix: makeRiskMatrix(),
    dealBreakerFlags: makeDealBreakers(),
  };
}

describe('buildCitationRegistry', () => {
  it('mints findingIds keyed by specialistKey:index', () => {
    const reg = buildCitationRegistry(makeSource());
    expect(reg.findingIds.has('contract:0')).toBe(true);
    expect(reg.findingIds.has('contract:1')).toBe(true);
    expect(reg.findingIds.has('ip:0')).toBe(true);
    expect(reg.findingIds.size).toBe(3);
  });

  it('mints documentIds from documentIndex', () => {
    const reg = buildCitationRegistry(makeSource());
    expect(reg.documentIds.has('doc-1')).toBe(true);
    expect(reg.documentIds.has('doc-2')).toBe(true);
    expect(reg.documentIds.size).toBe(2);
  });

  it('mints riskRowIds as category:severity', () => {
    const reg = buildCitationRegistry(makeSource());
    expect(reg.riskRowIds.has('contractual:high')).toBe(true);
    expect(reg.riskRowIds.has('ip:critical')).toBe(true);
    expect(reg.riskRowIds.size).toBe(2);
  });

  it('mints dealBreakerFlagIds as db-<index>', () => {
    const reg = buildCitationRegistry(makeSource());
    expect(reg.dealBreakerFlagIds.has('db-0')).toBe(true);
    expect(reg.dealBreakerFlagIds.has('db-1')).toBe(true);
    expect(reg.dealBreakerFlagIds.size).toBe(2);
  });

  it('handles empty inputs cleanly', () => {
    const reg = buildCitationRegistry({
      documentIndex: [],
      runningFindings: {},
      riskMatrix: undefined,
      dealBreakerFlags: [],
    });
    expect(reg.findingIds.size).toBe(0);
    expect(reg.documentIds.size).toBe(0);
    expect(reg.riskRowIds.size).toBe(0);
    expect(reg.dealBreakerFlagIds.size).toBe(0);
  });

  it('populates human-readable entry lists for prompt assembly', () => {
    const reg = buildCitationRegistry(makeSource());
    expect(reg.findingEntries).toHaveLength(3);
    expect(reg.findingEntries[0]).toMatchObject({
      id: 'contract:0',
      documentName: 'MSA.pdf',
      finding: 'MFN clause present',
      specialistKey: 'contract',
    });
    expect(reg.documentEntries).toHaveLength(2);
    expect(reg.riskRowEntries).toHaveLength(2);
    expect(reg.dealBreakerEntries).toHaveLength(2);
  });
});

describe('validateCitations', () => {
  const registry = buildCitationRegistry(makeSource());

  it('accepts a ref with a valid findingId + excerpt', () => {
    const refs: CitationRef[] = [
      { findingId: 'contract:0', excerpt: 'MFN clause present' },
    ];
    expect(() =>
      validateCitations('reps-warranties', refs, registry),
    ).not.toThrow();
  });

  it('accepts a ref with every ID field set to a valid value', () => {
    const refs: CitationRef[] = [
      {
        findingId: 'ip:0',
        documentId: 'doc-1',
        riskRowId: 'ip:critical',
        dealBreakerFlagId: 'db-0',
        excerpt: 'Missing IP assignment',
      },
    ];
    expect(() =>
      validateCitations('indemnification', refs, registry),
    ).not.toThrow();
  });

  it('throws when findingId does not resolve', () => {
    const refs: CitationRef[] = [
      { findingId: 'contract:99', excerpt: 'fabricated' },
    ];
    expect(() => validateCitations('reps-warranties', refs, registry)).toThrow(
      CitationValidationError,
    );
  });

  it('throws when documentId does not resolve', () => {
    const refs: CitationRef[] = [
      { documentId: 'doc-nonexistent', excerpt: 'bad' },
    ];
    expect(() => validateCitations('covenants', refs, registry)).toThrow(
      /documentId "doc-nonexistent" does not resolve/,
    );
  });

  it('throws when riskRowId does not resolve', () => {
    const refs: CitationRef[] = [
      { riskRowId: 'quantum:catastrophic', excerpt: 'bad' },
    ];
    expect(() =>
      validateCitations('disclosure-schedules', refs, registry),
    ).toThrow(/riskRowId/);
  });

  it('throws when dealBreakerFlagId does not resolve', () => {
    const refs: CitationRef[] = [
      { dealBreakerFlagId: 'db-42', excerpt: 'bad' },
    ];
    expect(() =>
      validateCitations('conditions-precedent', refs, registry),
    ).toThrow(/dealBreakerFlagId/);
  });

  it('throws when no ID fields are provided', () => {
    const refs: CitationRef[] = [{ excerpt: 'unsourced claim' }];
    expect(() => validateCitations('reps-warranties', refs, registry)).toThrow(
      /at least one of/,
    );
  });

  it('throws when excerpt is missing or empty', () => {
    const refs: CitationRef[] = [{ findingId: 'contract:0', excerpt: '   ' }];
    expect(() => validateCitations('reps-warranties', refs, registry)).toThrow(
      /excerpt is missing or empty/,
    );
  });

  it('aggregates all unresolved refs into a single error', () => {
    const refs: CitationRef[] = [
      { findingId: 'contract:0', excerpt: 'ok' }, // valid
      { findingId: 'nope:1', excerpt: 'bad1' },
      { documentId: 'doc-missing', excerpt: 'bad2' },
    ];
    let caught: CitationValidationError | undefined;
    try {
      validateCitations('covenants', refs, registry);
    } catch (err) {
      caught = err as CitationValidationError;
    }
    expect(caught).toBeInstanceOf(CitationValidationError);
    expect(caught!.unresolved).toHaveLength(2);
    expect(caught!.sectionId).toBe('covenants');
  });

  it('throws when refs is not an array', () => {
    expect(() =>
      validateCitations(
        'reps-warranties',
        undefined as unknown as CitationRef[],
        registry,
      ),
    ).toThrow(/missing or not an array/);
  });

  it('accepts an empty citations array without throwing', () => {
    // Empty arrays are a prompt-level concern — the validator is only
    // responsible for verifying non-fabrication of IDs that are claimed.
    // Section nodes decide whether empty is acceptable for that section.
    expect(() => validateCitations('covenants', [], registry)).not.toThrow();
  });
});
