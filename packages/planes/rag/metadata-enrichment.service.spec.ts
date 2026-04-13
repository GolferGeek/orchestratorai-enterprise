import { Test, TestingModule } from '@nestjs/testing';
import { MetadataEnrichmentService } from './metadata-enrichment.service';
import { Chunk } from './chunking.service';

describe('MetadataEnrichmentService', () => {
  let service: MetadataEnrichmentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetadataEnrichmentService],
    }).compile();

    module.useLogger(false);

    service = module.get<MetadataEnrichmentService>(
      MetadataEnrichmentService,
    );
  });

  // Helper to access private methods for unit testing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const callPrivate = (method: string, ...args: any[]) =>
    (service as any)[method](...args);

  describe('extractDocumentId', () => {
    it('should extract Document ID from bold label', () => {
      const text = '**Document ID:** HR-001\nSome content';
      expect(callPrivate('extractDocumentId', text, 'doc.md')).toBe('HR-001');
    });

    it('should extract Policy Number', () => {
      const text = '**Policy Number:** POL-200-GDPR\nContent';
      expect(callPrivate('extractDocumentId', text, 'doc.md')).toBe(
        'POL-200-GDPR',
      );
    });

    it('should extract DPA Number', () => {
      const text = '**DPA Number:** DPA-100\nContent';
      expect(callPrivate('extractDocumentId', text, 'doc.md')).toBe(
        'DPA-100',
      );
    });

    it('should extract Agreement ID', () => {
      const text = '**Agreement ID:** AGR-050\nContent';
      expect(callPrivate('extractDocumentId', text, 'doc.md')).toBe(
        'AGR-050',
      );
    });

    it('should fall back to filename when no ID in content', () => {
      const text = 'Just some text without any document ID';
      expect(
        callPrivate('extractDocumentId', text, 'employee-handbook-v2.md'),
      ).toBe('EMPLOYEE-HANDBOOK-V2');
    });

    it('should handle filename with path', () => {
      const text = 'No ID here';
      expect(
        callPrivate('extractDocumentId', text, 'data-processing-agreement.md'),
      ).toBe('DATA-PROCESSING-AGREEMENT');
    });
  });

  describe('extractVersion', () => {
    it('should extract Version from content', () => {
      const text = '**Version:** 2.1\nContent';
      expect(callPrivate('extractVersion', text, 'doc.md')).toBe('2.1');
    });

    it('should extract Template Version', () => {
      const text = '**Template Version:** 3.0\nContent';
      expect(callPrivate('extractVersion', text, 'doc.md')).toBe('3.0');
    });

    it('should extract Rev from content', () => {
      const text = '**Rev:** 5\nContent';
      expect(callPrivate('extractVersion', text, 'doc.md')).toBe('5');
    });

    it('should extract Revision from content', () => {
      const text = '**Revision:** 1.2.3\nContent';
      expect(callPrivate('extractVersion', text, 'doc.md')).toBe('1.2.3');
    });

    it('should fall back to filename version', () => {
      const text = 'No version in content';
      expect(callPrivate('extractVersion', text, 'policy-v2.3.md')).toBe(
        '2.3',
      );
    });

    it('should return null when no version found', () => {
      const text = 'No version anywhere';
      expect(callPrivate('extractVersion', text, 'plain-doc.md')).toBeNull();
    });
  });

  describe('classifyDocumentType', () => {
    it('should classify policy documents', () => {
      const text = '# Data Privacy Policy\nContent here';
      expect(callPrivate('classifyDocumentType', text, 'doc.md')).toBe(
        'policy',
      );
    });

    it('should classify from filename', () => {
      const text = '# Some Title\nContent';
      expect(
        callPrivate('classifyDocumentType', text, 'employee-handbook.md'),
      ).toBe('guide');
    });

    it('should classify template documents', () => {
      const text = '# Termination Notice Template\nContent';
      expect(callPrivate('classifyDocumentType', text, 'doc.md')).toBe(
        'template',
      );
    });

    it('should classify checklist documents', () => {
      const text = '# Onboarding Checklist\nContent';
      expect(callPrivate('classifyDocumentType', text, 'doc.md')).toBe(
        'checklist',
      );
    });

    it('should classify agreement documents', () => {
      const text = '# Master Service Agreement\nContent';
      expect(callPrivate('classifyDocumentType', text, 'doc.md')).toBe(
        'agreement',
      );
    });

    it('should classify agreement from filename keywords', () => {
      const text = '# Some Title\nContent';
      expect(callPrivate('classifyDocumentType', text, 'nda-agreement.md')).toBe(
        'agreement',
      );
    });

    it('should classify procedure documents', () => {
      const text = '# Incident Response Procedure\nContent';
      expect(callPrivate('classifyDocumentType', text, 'doc.md')).toBe(
        'procedure',
      );
    });

    it('should return null for unclassifiable documents', () => {
      const text = '# Quarterly Report\nContent';
      expect(callPrivate('classifyDocumentType', text, 'report.md')).toBeNull();
    });
  });

  describe('buildHeadingIndex', () => {
    it('should extract all heading levels', () => {
      const text = '# H1\n## H2\n### H3\nContent\n#### H4';
      const headings = callPrivate('buildHeadingIndex', text) as Array<{
        level: number;
        text: string;
        charOffset: number;
      }>;

      expect(headings).toHaveLength(4);
      expect(headings[0]).toEqual(
        expect.objectContaining({ level: 1, text: 'H1' }),
      );
      expect(headings[1]).toEqual(
        expect.objectContaining({ level: 2, text: 'H2' }),
      );
      expect(headings[2]).toEqual(
        expect.objectContaining({ level: 3, text: 'H3' }),
      );
      expect(headings[3]).toEqual(
        expect.objectContaining({ level: 4, text: 'H4' }),
      );
    });

    it('should record charOffset for each heading', () => {
      const text = '# First\nSome text\n## Second';
      const headings = callPrivate('buildHeadingIndex', text) as Array<{
        level: number;
        text: string;
        charOffset: number;
      }>;

      expect(headings).toHaveLength(2);
      expect(headings[0]!.charOffset).toBe(0);
      expect(headings[1]!.charOffset).toBeGreaterThan(0);
    });

    it('should return sorted by charOffset', () => {
      const text = '## B\nContent\n# A\nContent\n### C';
      const headings = callPrivate('buildHeadingIndex', text) as Array<{
        charOffset: number;
      }>;

      for (let i = 1; i < headings.length; i++) {
        expect(headings[i]!.charOffset).toBeGreaterThan(
          headings[i - 1]!.charOffset,
        );
      }
    });

    it('should return empty array for text with no headings', () => {
      const text = 'Just plain text without any headings.';
      const headings = callPrivate('buildHeadingIndex', text) as unknown[];
      expect(headings).toEqual([]);
    });
  });

  describe('extractCrossReferences', () => {
    it('should extract bracketed IDs', () => {
      const text = 'See [HR-001] and [DPA-100-GDPR] for details.';
      const refs = callPrivate(
        'extractCrossReferences',
        text,
        null,
      ) as Array<{ id: string }>;

      expect(refs).toHaveLength(2);
      expect(refs.map((r) => r.id)).toEqual(
        expect.arrayContaining(['HR-001', 'DPA-100-GDPR']),
      );
    });

    it('should filter out own document ID', () => {
      const text = 'This document [HR-001] references [HR-002].';
      const refs = callPrivate(
        'extractCrossReferences',
        text,
        'HR-001',
      ) as Array<{ id: string }>;

      expect(refs).toHaveLength(1);
      expect(refs[0]!.id).toBe('HR-002');
    });

    it('should extract markdown links to .md files', () => {
      const text =
        'See [Employee Guide](./employee-guide.md) for more info.';
      const refs = callPrivate(
        'extractCrossReferences',
        text,
        null,
      ) as Array<{ id: string; title: string; relationship: string }>;

      const mdRef = refs.find((r) => r.relationship === 'linked');
      expect(mdRef).toBeDefined();
      expect(mdRef!.title).toBe('Employee Guide');
    });

    it('should extract "See" / "Refer to" patterns', () => {
      const text = 'Refer to the Data Privacy Standards Framework [FRAMEWORK-REV2] for details.';
      const refs = callPrivate(
        'extractCrossReferences',
        text,
        null,
      ) as Array<{ id: string; title: string; relationship: string }>;

      const seeRef = refs.find((r) => r.relationship === 'see-also');
      expect(seeRef).toBeDefined();
      expect(seeRef!.id).toBe('FRAMEWORK-REV2');
    });

    it('should extract from Cross-References section', () => {
      const text = [
        '## Content',
        'Some content here.',
        '## Cross-References',
        '- [POLICY-V1] Privacy Policy',
        '- Data Guide [REFERENCE-DOC]',
        '',
      ].join('\n');

      const refs = callPrivate(
        'extractCrossReferences',
        text,
        null,
      ) as Array<{ id: string; relationship: string }>;

      const crossRefIds = refs
        .filter((r) => r.relationship === 'cross-reference')
        .map((r) => r.id);
      expect(crossRefIds).toContain('POLICY-V1');
      expect(crossRefIds).toContain('REFERENCE-DOC');
    });

    it('should deduplicate cross-references', () => {
      const text = 'See [HR-001] and then [HR-001] again.';
      const refs = callPrivate(
        'extractCrossReferences',
        text,
        null,
      ) as Array<{ id: string }>;

      expect(refs.filter((r) => r.id === 'HR-001')).toHaveLength(1);
    });
  });

  describe('buildSectionPath', () => {
    const headings = [
      { level: 1, text: 'Document Title', charOffset: 0 },
      { level: 2, text: 'Article I: Definitions', charOffset: 50 },
      { level: 3, text: 'Section 1.1: Key Terms', charOffset: 100 },
      { level: 2, text: 'Article II: Fee Structures', charOffset: 300 },
      {
        level: 3,
        text: 'Section 2.3: Contingency Fees',
        charOffset: 400,
      },
    ];

    it('should build nested section path', () => {
      const result = callPrivate('buildSectionPath', 150, headings);
      expect(result).toBe(
        'Document Title > Article I: Definitions > Section 1.1: Key Terms',
      );
    });

    it('should reset deeper levels when a higher heading appears', () => {
      const result = callPrivate('buildSectionPath', 450, headings);
      expect(result).toBe(
        'Document Title > Article II: Fee Structures > Section 2.3: Contingency Fees',
      );
      expect(result).not.toContain('Article I: Definitions');
      expect(result).not.toContain('Section 1.1');
    });

    it('should return null for offset before any heading', () => {
      const result = callPrivate('buildSectionPath', 0, [
        { level: 1, text: 'Title', charOffset: 10 },
      ]);
      expect(result).toBeNull();
    });

    it('should return null for empty heading index', () => {
      const result = callPrivate('buildSectionPath', 100, []);
      expect(result).toBeNull();
    });
  });

  describe('enrichChunks (end-to-end)', () => {
    const sampleDocument = [
      '# Employee Handbook',
      '',
      '**Document ID:** HR-001',
      '**Version:** 3.2',
      '**Effective Date:** January 15, 2026',
      '',
      '## Introduction',
      '',
      'This handbook outlines company policies. See [POL-100] for the code of conduct.',
      '',
      '## Article I: Employment Policies',
      '',
      '### Section 1.1: At-Will Employment',
      '',
      'All employment is **at-will**. The **Employee** may resign at any time.',
      '',
      '### Section 1.2: Equal Opportunity',
      '',
      'We are an **Equal Opportunity Employer**. Refer to the Anti-Discrimination Standards [ADS-200] for details.',
      '',
      '## Cross-References',
      '- [BEN-300] Benefits Guide',
      '',
    ].join('\n');

    it('should enrich chunks with document-level metadata', () => {
      const chunks: Chunk[] = [
        {
          content: 'This handbook outlines company policies. See [POL-100] for the code of conduct.',
          chunkIndex: 0,
          charOffset: 0,
        },
      ];

      const result = service.enrichChunks(
        chunks,
        sampleDocument,
        'employee-handbook.md',
      );

      expect(result[0]!.metadata).toBeDefined();
      expect(result[0]!.metadata!['document_id']).toBe('HR-001');
      expect(result[0]!.metadata!['document_type']).toBe('guide');
      expect(result[0]!.metadata!['version']).toBe('3.2');
    });

    it('should enrich chunks with section path', () => {
      const chunkContent =
        'All employment is **at-will**. The **Employee** may resign at any time.';
      const charOffset = sampleDocument.indexOf(chunkContent);

      const chunks: Chunk[] = [
        { content: chunkContent, chunkIndex: 0, charOffset },
      ];

      const result = service.enrichChunks(
        chunks,
        sampleDocument,
        'employee-handbook.md',
      );

      expect(result[0]!.metadata!['section_path']).toContain(
        'Employee Handbook',
      );
      expect(result[0]!.metadata!['section_path']).toContain(
        'Section 1.1: At-Will Employment',
      );
      expect(result[0]!.metadata!['section_heading']).toBe(
        'Section 1.1: At-Will Employment',
      );
    });

    it('should extract keywords from bold terms', () => {
      const chunkContent =
        'All employment is **at-will**. The **Employee** may resign at any time.';
      const charOffset = sampleDocument.indexOf(chunkContent);

      const chunks: Chunk[] = [
        { content: chunkContent, chunkIndex: 0, charOffset },
      ];

      const result = service.enrichChunks(
        chunks,
        sampleDocument,
        'employee-handbook.md',
      );

      expect(result[0]!.metadata!['keywords']).toEqual(
        expect.arrayContaining(['at-will', 'Employee']),
      );
    });

    it('should include cross-references found in chunk content', () => {
      const chunkContent =
        'This handbook outlines company policies. See [POL-100] for the code of conduct.';
      const charOffset = sampleDocument.indexOf(chunkContent);

      const chunks: Chunk[] = [
        { content: chunkContent, chunkIndex: 0, charOffset },
      ];

      const result = service.enrichChunks(
        chunks,
        sampleDocument,
        'employee-handbook.md',
      );

      const crossRefs = result[0]!.metadata!['cross_references'] as Array<{
        id: string;
      }>;
      expect(crossRefs).toBeDefined();
      expect(crossRefs.some((r) => r.id === 'POL-100')).toBe(true);
    });

    it('should handle empty chunks array', () => {
      const result = service.enrichChunks([], sampleDocument, 'doc.md');
      expect(result).toEqual([]);
    });

    it('should handle empty full text', () => {
      const chunks: Chunk[] = [
        { content: 'some content', chunkIndex: 0, charOffset: 0 },
      ];
      const result = service.enrichChunks(chunks, '', 'doc.md');
      expect(result).toEqual(chunks);
    });

    it('should not set null-valued metadata keys', () => {
      const text = 'Just some plain text without any structure.';
      const chunks: Chunk[] = [
        { content: text, chunkIndex: 0, charOffset: 0 },
      ];

      const result = service.enrichChunks(chunks, text, 'plain.txt');

      const metadata = result[0]!.metadata!;
      for (const value of Object.values(metadata)) {
        expect(value).not.toBeNull();
      }
    });

    it('should preserve existing chunk metadata', () => {
      const chunks: Chunk[] = [
        {
          content: 'Some content from the handbook.',
          chunkIndex: 0,
          charOffset: 0,
          metadata: { existing_key: 'existing_value' },
        },
      ];

      const result = service.enrichChunks(
        chunks,
        sampleDocument,
        'employee-handbook.md',
      );

      expect(result[0]!.metadata!['existing_key']).toBe('existing_value');
      expect(result[0]!.metadata!['document_id']).toBe('HR-001');
    });
  });
});
