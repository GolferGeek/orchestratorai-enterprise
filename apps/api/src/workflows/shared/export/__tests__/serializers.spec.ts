import { documentToMarkdown } from '../serializers/document-to-markdown';
import { documentToDocx } from '../serializers/document-to-docx';
import { documentToPdf } from '../serializers/document-to-pdf';
import { ExportService } from '../export.service';
import { b, i, t } from '../export-document';
import type { ExportDocument, ExportTableRow } from '../export-document';

const SAMPLE: ExportDocument = {
  title: 'Sample Document',
  generatedAt: '2026-05-14T12:00:00Z',
  metadata: [
    { label: 'job', value: 'job-1' },
    { label: 'mode', value: 'demo' },
  ],
  sections: [
    {
      heading: 'Overview',
      level: 2,
      blocks: [
        {
          kind: 'paragraph',
          runs: [
            t('A '),
            b('bold'),
            t(' word and an '),
            i('italic'),
            t(' word.'),
          ],
        },
        {
          kind: 'bullets',
          items: [
            { runs: [t('First bullet')] },
            {
              runs: [t('Second bullet')],
              details: [{ label: 'Note', value: 'with detail' }],
            },
          ],
        },
        { kind: 'definition', label: 'Defined:', value: 'value here' },
      ],
    },
    {
      heading: 'Numbered things',
      level: 2,
      blocks: [
        {
          kind: 'numbered',
          items: [
            {
              primary: [b('First item')],
              details: [{ label: 'Reason', value: 'because' }],
            },
            { primary: [t('Second item')], details: [] },
          ],
        },
      ],
    },
  ],
  footer: 'Test footer',
};

const TABLE_ROWS: ExportTableRow[] = [
  {
    cells: [
      { runs: [b('1.1')] },
      { runs: [t('Feature A')] },
      { runs: [t('Matches exactly')] },
    ],
  },
  {
    cells: [
      { runs: [t('1.2')] },
      { runs: [i('Feature B')] },
      { runs: [t('')] },
    ],
  },
];

const TABLE_DOC: ExportDocument = {
  title: 'Table Test',
  generatedAt: '2026-06-11T00:00:00Z',
  metadata: [],
  sections: [
    {
      heading: 'Claim Chart',
      level: 2,
      blocks: [
        {
          kind: 'table',
          headers: ['Element', 'Feature', 'Evidence'],
          rows: TABLE_ROWS,
          caption: 'Patent vs Product',
        },
        {
          kind: 'table',
          headers: ['A', 'B'],
          rows: [{ cells: [{ runs: [t('x')] }, { runs: [t('y')] }] }],
        },
      ],
    },
  ],
};

describe('export serializers', () => {
  describe('documentToMarkdown', () => {
    const md = documentToMarkdown(SAMPLE);

    it('writes the title as H1', () => {
      expect(md).toMatch(/^# Sample Document/);
    });

    it('joins metadata into the italic header line', () => {
      expect(md).toContain(
        'Generated 2026-05-14T12:00:00Z · job: job-1 · mode: demo',
      );
    });

    it('renders sections at the requested heading level', () => {
      expect(md).toContain('## Overview');
      expect(md).toContain('## Numbered things');
    });

    it('renders inline bold and italic runs', () => {
      expect(md).toContain('A **bold** word and an _italic_ word.');
    });

    it('renders bullets with nested detail bullets', () => {
      expect(md).toContain('- First bullet');
      expect(md).toContain('- Second bullet');
      expect(md).toContain('  - **Note** with detail');
    });

    it('renders definition blocks', () => {
      expect(md).toContain('**Defined:** value here');
    });

    it('renders numbered items with detail lines', () => {
      expect(md).toContain('1. **First item**');
      expect(md).toContain('   - _Reason:_ because');
      expect(md).toContain('2. Second item');
    });

    it('renders the footer with separator', () => {
      expect(md).toContain('---');
      expect(md).toContain('_Test footer_');
    });

    it('renders a GFM table with headers, separator, and data rows', () => {
      const tableMd = documentToMarkdown(TABLE_DOC);
      expect(tableMd).toContain('| Element | Feature | Evidence |');
      expect(tableMd).toContain('| --- | --- | --- |');
      expect(tableMd).toContain('| **1.1** | Feature A | Matches exactly |');
      expect(tableMd).toContain('| 1.2 | _Feature B_ |  |');
    });

    it('renders table caption as italic line above', () => {
      const tableMd = documentToMarkdown(TABLE_DOC);
      expect(tableMd).toContain('_Patent vs Product_');
    });

    it('renders a table without caption', () => {
      const tableMd = documentToMarkdown(TABLE_DOC);
      expect(tableMd).toContain('| A | B |');
      expect(tableMd).toContain('| x | y |');
    });

    it('escapes pipe characters and newlines in table cells', () => {
      const pipeDoc: ExportDocument = {
        title: 'Pipe Test',
        generatedAt: '2026-06-11T00:00:00Z',
        metadata: [],
        sections: [
          {
            heading: 'Test',
            level: 2,
            blocks: [
              {
                kind: 'table' as const,
                headers: ['Col|A', 'B'],
                rows: [
                  {
                    cells: [
                      { runs: [t('val|ue')] },
                      { runs: [t('line1\nline2')] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      const pipeMd = documentToMarkdown(pipeDoc);
      expect(pipeMd).toContain('Col\\|A');
      expect(pipeMd).toContain('val\\|ue');
      expect(pipeMd).not.toContain('line1\nline2');
      expect(pipeMd).toContain('line1 line2');
    });
  });

  describe('documentToDocx', () => {
    it('produces a non-empty docx with the PK signature', async () => {
      const buf = await documentToDocx(SAMPLE);
      expect(buf.length).toBeGreaterThan(1000);
      expect(buf[0]).toBe(0x50);
      expect(buf[1]).toBe(0x4b);
    });

    it('produces a valid docx from a document with tables', async () => {
      const buf = await documentToDocx(TABLE_DOC);
      expect(buf.length).toBeGreaterThan(1000);
      expect(buf[0]).toBe(0x50);
      expect(buf[1]).toBe(0x4b);
    });
  });

  describe('documentToPdf', () => {
    it('produces a non-empty PDF with the %PDF signature', async () => {
      const buf = await documentToPdf(SAMPLE);
      expect(buf.length).toBeGreaterThan(1000);
      expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('produces a valid PDF from a document with tables', async () => {
      const buf = await documentToPdf(TABLE_DOC);
      expect(buf.length).toBeGreaterThan(1000);
      expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    });
  });

  describe('ExportService', () => {
    const svc = new ExportService();

    it('renders md format as a UTF-8 buffer', async () => {
      const buf = await svc.render(SAMPLE, 'md');
      expect(buf.toString('utf-8')).toMatch(/^# Sample Document/);
    });

    it('renders docx format as a buffer with PK signature', async () => {
      const buf = await svc.render(SAMPLE, 'docx');
      expect(buf[0]).toBe(0x50);
      expect(buf[1]).toBe(0x4b);
    });

    it('renders pdf format as a buffer with %PDF signature', async () => {
      const buf = await svc.render(SAMPLE, 'pdf');
      expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    });
  });
});
