/**
 * Unit tests for CreateDiscoveryReviewModal validation logic.
 *
 * Tests the canSubmit and sizeError guard logic without mounting the full Vue
 * component (which requires Ionic and LangGraph mocks). Logic is extracted to
 * pure functions that mirror the component's computed properties.
 */
import { describe, it, expect } from 'vitest';

// ── Pure helpers extracted from the component's computed properties ──────────

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_FILES = 100;

interface Protocol {
  matterId: string;
  matterName: string;
  privilegeReviewRequired: boolean;
  batchSize: number;
  confidenceThreshold: number;
  issueTags: Array<{ tagId: string; tagName: string; description: string }>;
}

function sizeError(files: File[]): string | null {
  if (files.length > MAX_FILES) {
    return `Too many files: ${files.length} exceeds the maximum of ${MAX_FILES}.`;
  }
  const oversized = files.find((f) => f.size > MAX_FILE_SIZE);
  if (oversized) {
    return `File "${oversized.name}" is too large — exceeds the 50MB per-file limit.`;
  }
  return null;
}

function canSubmit(
  protocol: Protocol,
  claimsInput: string,
  attorneysInput: string,
  files: File[],
  submitting: boolean,
  fileSizeError: string | null,
): boolean {
  const hasClaims = claimsInput.trim().length > 0;
  const hasAttorneys =
    !protocol.privilegeReviewRequired || attorneysInput.trim().length > 0;
  return (
    protocol.matterId.trim() !== '' &&
    protocol.matterName.trim() !== '' &&
    hasClaims &&
    hasAttorneys &&
    files.length > 0 &&
    !fileSizeError &&
    !submitting
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFile(name: string, size: number): File {
  const buf = new ArrayBuffer(size);
  return new File([buf], name, { type: 'application/pdf' });
}

const baseProtocol: Protocol = {
  matterId: 'ACME-2024-001',
  matterName: 'Acme Corp v. Globex Inc.',
  privilegeReviewRequired: false,
  batchSize: 50,
  confidenceThreshold: 0.7,
  issueTags: [],
};

// ── sizeError ─────────────────────────────────────────────────────────────────

describe('sizeError()', () => {
  it('returns null when files list is empty', () => {
    expect(sizeError([])).toBeNull();
  });

  it('returns null for files within size limit', () => {
    const file = makeFile('doc.pdf', 1024 * 1024); // 1 MB
    expect(sizeError([file])).toBeNull();
  });

  it('returns an error message when a file exceeds 50 MB', () => {
    const bigFile = makeFile('huge.pdf', MAX_FILE_SIZE + 1);
    const result = sizeError([bigFile]);
    expect(result).not.toBeNull();
    expect(result).toContain('huge.pdf');
  });

  it('returns an error message when file count exceeds 100', () => {
    const files = Array.from({ length: 101 }, (_, i) =>
      makeFile(`doc-${i}.pdf`, 100),
    );
    const result = sizeError(files);
    expect(result).not.toBeNull();
    expect(result).toContain('101');
  });

  it('returns null for exactly 100 files all within size limit', () => {
    const files = Array.from({ length: 100 }, (_, i) =>
      makeFile(`doc-${i}.pdf`, 1024),
    );
    expect(sizeError(files)).toBeNull();
  });
});

// ── canSubmit ─────────────────────────────────────────────────────────────────

describe('canSubmit()', () => {
  const oneFile = makeFile('contract.pdf', 1024);

  it('returns true when all required fields are present', () => {
    expect(
      canSubmit(baseProtocol, 'breach of contract', '', [oneFile], false, null),
    ).toBe(true);
  });

  it('returns false when matterId is empty', () => {
    expect(
      canSubmit(
        { ...baseProtocol, matterId: '' },
        'breach of contract',
        '',
        [oneFile],
        false,
        null,
      ),
    ).toBe(false);
  });

  it('returns false when matterName is empty', () => {
    expect(
      canSubmit(
        { ...baseProtocol, matterName: '' },
        'breach of contract',
        '',
        [oneFile],
        false,
        null,
      ),
    ).toBe(false);
  });

  it('returns false when claims input is blank', () => {
    expect(
      canSubmit(baseProtocol, '   ', '', [oneFile], false, null),
    ).toBe(false);
  });

  it('returns false when no files are selected', () => {
    expect(
      canSubmit(baseProtocol, 'breach of contract', '', [], false, null),
    ).toBe(false);
  });

  it('returns false while submitting', () => {
    expect(
      canSubmit(baseProtocol, 'breach of contract', '', [oneFile], true, null),
    ).toBe(false);
  });

  it('returns false when there is a size error', () => {
    expect(
      canSubmit(
        baseProtocol,
        'breach of contract',
        '',
        [oneFile],
        false,
        'File too large',
      ),
    ).toBe(false);
  });

  describe('when privilegeReviewRequired is true', () => {
    const privilegeProtocol: Protocol = {
      ...baseProtocol,
      privilegeReviewRequired: true,
    };

    it('returns false when attorneys list is empty', () => {
      expect(
        canSubmit(
          privilegeProtocol,
          'breach of contract',
          '',
          [oneFile],
          false,
          null,
        ),
      ).toBe(false);
    });

    it('returns true when attorneys list is provided', () => {
      expect(
        canSubmit(
          privilegeProtocol,
          'breach of contract',
          'Jane Smith',
          [oneFile],
          false,
          null,
        ),
      ).toBe(true);
    });

    it('returns false when attorneys input is only whitespace', () => {
      expect(
        canSubmit(
          privilegeProtocol,
          'breach of contract',
          '   ',
          [oneFile],
          false,
          null,
        ),
      ).toBe(false);
    });
  });
});
