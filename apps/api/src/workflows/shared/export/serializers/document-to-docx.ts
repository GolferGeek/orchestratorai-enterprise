import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from 'docx';
import type {
  ExportBlock,
  ExportDocument,
  ExportInline,
  ExportListItem,
  ExportNumberedItem,
  ExportSection,
  ExportTableRow,
} from '../export-document';

export async function documentToDocx(doc: ExportDocument): Promise<Buffer> {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({ text: doc.title, heading: HeadingLevel.HEADING_1 }),
  );

  const metaParts = [
    `Generated ${doc.generatedAt}`,
    ...doc.metadata.map((m) => `${m.label}: ${m.value}`),
  ];
  children.push(
    new Paragraph({
      children: [new TextRun({ text: metaParts.join(' · '), italics: true })],
    }),
  );
  children.push(blank());

  for (const section of doc.sections) {
    renderSection(children, section);
  }

  if (doc.footer) {
    children.push(blank());
    children.push(
      new Paragraph({
        children: [new TextRun({ text: doc.footer, italics: true })],
      }),
    );
  }

  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}

function renderSection(children: Paragraph[], section: ExportSection): void {
  const headingLevel =
    section.level === 2
      ? HeadingLevel.HEADING_2
      : section.level === 3
        ? HeadingLevel.HEADING_3
        : HeadingLevel.HEADING_4;
  children.push(
    new Paragraph({ text: section.heading, heading: headingLevel }),
  );
  for (const block of section.blocks) renderBlock(children, block);
}

function renderBlock(children: Paragraph[], block: ExportBlock): void {
  switch (block.kind) {
    case 'paragraph':
      children.push(new Paragraph({ children: inlineRuns(block.runs) }));
      return;
    case 'bullets':
      for (const item of block.items) renderListItem(children, item);
      return;
    case 'definition':
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${block.label} `, bold: true }),
            new TextRun(block.value),
          ],
        }),
      );
      return;
    case 'numbered':
      for (let i = 0; i < block.items.length; i++) {
        renderNumberedItem(children, i + 1, block.items[i]!);
      }
      return;
    case 'table':
      renderDocxTable(children, block.headers, block.rows, block.caption);
      return;
  }
}

function renderListItem(children: Paragraph[], item: ExportListItem): void {
  children.push(
    new Paragraph({ children: inlineRuns(item.runs), bullet: { level: 0 } }),
  );
  if (item.details) {
    for (const d of item.details) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${d.label} `, bold: true }),
            new TextRun(d.value),
          ],
          bullet: { level: 1 },
        }),
      );
    }
  }
}

function renderNumberedItem(
  children: Paragraph[],
  index: number,
  item: ExportNumberedItem,
): void {
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: `${index}. `, bold: true }),
        ...inlineRuns(item.primary),
      ],
    }),
  );
  for (const d of item.details) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${d.label}: `, italics: true, bold: true }),
          new TextRun({ text: d.value, italics: true }),
        ],
      }),
    );
  }
}

function renderDocxTable(
  children: Paragraph[],
  headers: string[],
  rows: ExportTableRow[],
  caption?: string,
): void {
  if (caption) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: caption, italics: true })],
      }),
    );
  }
  const colCount = headers.length;
  const colWidth = Math.floor(9000 / colCount);

  const headerRow = new TableRow({
    children: headers.map(
      (h) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: h, bold: true })],
            }),
          ],
          width: { size: colWidth, type: WidthType.DXA },
        }),
    ),
  });

  const dataRows = rows.map(
    (row) =>
      new TableRow({
        children: row.cells.map(
          (cell) =>
            new TableCell({
              children: [new Paragraph({ children: inlineRuns(cell.runs) })],
              width: { size: colWidth, type: WidthType.DXA },
            }),
        ),
      }),
  );

  // Table must have at least one row; push as a non-Paragraph element via cast
  const table = new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 9000, type: WidthType.DXA },
  });
  // docx Paragraph[] array needs to accept the Table — cast to any since
  // Document sections accept both Paragraph and Table but our array is typed narrowly
  (children as unknown as (Paragraph | Table)[]).push(table);
  children.push(blank());
}

function inlineRuns(runs: ExportInline[]): ParagraphChild[] {
  return runs.map((r) => {
    if (r.kind === 'bold') return new TextRun({ text: r.text, bold: true });
    if (r.kind === 'italic')
      return new TextRun({ text: r.text, italics: true });
    return new TextRun(r.text);
  });
}

function blank(): Paragraph {
  return new Paragraph({ children: [] });
}
