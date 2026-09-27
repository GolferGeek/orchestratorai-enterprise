import type {
  ExportBlock,
  ExportDocument,
  ExportInline,
  ExportListItem,
  ExportNumberedItem,
  ExportSection,
  ExportTableRow,
} from '../export-document';
// pdfkit is CommonJS (`export = PDFDocument`); without esModuleInterop a namespace
// import compiles to a plain require of the class.
import * as PDFDocument from 'pdfkit';

const STYLE = {
  marginX: 54,
  marginY: 54,
  baseFont: 'Times-Roman',
  boldFont: 'Times-Bold',
  italicFont: 'Times-Italic',
};

const FONT_SIZES = {
  h1: 22,
  h2: 16,
  h3: 13,
  h4: 11,
  body: 10,
  small: 9,
};

type Doc = PDFKit.PDFDocument;

export async function documentToPdf(doc: ExportDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const pdf = new PDFDocument({
      size: 'LETTER',
      margins: {
        top: STYLE.marginY,
        bottom: STYLE.marginY,
        left: STYLE.marginX,
        right: STYLE.marginX,
      },
    });
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    renderDocument(pdf, doc);
    pdf.end();
  });
}

function renderDocument(pdf: Doc, doc: ExportDocument): void {
  heading(pdf, doc.title, FONT_SIZES.h1);

  const metaParts = [
    `Generated ${doc.generatedAt}`,
    ...doc.metadata.map((m) => `${m.label}: ${m.value}`),
  ];
  italicLine(pdf, metaParts.join(' · '));
  spacer(pdf);

  for (const section of doc.sections) renderSection(pdf, section);

  if (doc.footer) {
    spacer(pdf);
    italicLine(pdf, doc.footer);
  }
}

function renderSection(pdf: Doc, section: ExportSection): void {
  const size =
    section.level === 2
      ? FONT_SIZES.h2
      : section.level === 3
        ? FONT_SIZES.h3
        : FONT_SIZES.h4;
  heading(pdf, section.heading, size);
  for (const block of section.blocks) renderBlock(pdf, block);
}

function renderBlock(pdf: Doc, block: ExportBlock): void {
  switch (block.kind) {
    case 'paragraph':
      renderInlineParagraph(pdf, block.runs);
      pdf.moveDown(0.4);
      return;
    case 'bullets':
      for (const item of block.items) renderListItem(pdf, item);
      pdf.moveDown(0.2);
      return;
    case 'definition':
      pdf.font(STYLE.boldFont).fontSize(FONT_SIZES.body).text(block.label, {
        continued: true,
      });
      pdf
        .font(STYLE.baseFont)
        .fontSize(FONT_SIZES.body)
        .text(` ${block.value}`, { paragraphGap: 4 });
      return;
    case 'numbered':
      for (let i = 0; i < block.items.length; i++) {
        renderNumberedItem(pdf, i + 1, block.items[i]!);
      }
      pdf.moveDown(0.2);
      return;
    case 'table':
      renderPdfTable(pdf, block.headers, block.rows, block.caption);
      return;
  }
}

function renderListItem(pdf: Doc, item: ExportListItem): void {
  pdf.font(STYLE.baseFont).fontSize(FONT_SIZES.body);
  pdf.text('• ', { indent: 12, continued: true });
  renderInlineParagraph(pdf, item.runs);
  if (item.details) {
    for (const d of item.details) {
      pdf
        .font(STYLE.boldFont)
        .fontSize(FONT_SIZES.body)
        .text(d.label, { indent: 24, continued: true });
      pdf
        .font(STYLE.baseFont)
        .fontSize(FONT_SIZES.body)
        .text(` ${d.value}`, { paragraphGap: 2 });
    }
  }
}

function renderNumberedItem(
  pdf: Doc,
  index: number,
  item: ExportNumberedItem,
): void {
  pdf.font(STYLE.boldFont).fontSize(FONT_SIZES.body);
  pdf.text(`${index}. `, { continued: true });
  renderInlineParagraph(pdf, item.primary);
  for (const d of item.details) {
    pdf
      .font(STYLE.italicFont)
      .fontSize(FONT_SIZES.body)
      .text(`${d.label}:`, { indent: 12, continued: true });
    pdf
      .font(STYLE.italicFont)
      .fontSize(FONT_SIZES.body)
      .text(` ${d.value}`, { paragraphGap: 2 });
  }
}

function renderPdfTable(
  pdf: Doc,
  headers: string[],
  rows: ExportTableRow[],
  caption?: string,
): void {
  if (caption) {
    italicLine(pdf, caption);
    pdf.moveDown(0.3);
  }

  const pageWidth = (pdf.page?.width ?? 612) - STYLE.marginX * 2;
  const colCount = headers.length;
  const colWidth = pageWidth / colCount;
  const startX = STYLE.marginX;

  // Header row
  pdf.font(STYLE.boldFont).fontSize(FONT_SIZES.body);
  for (let c = 0; c < colCount; c++) {
    pdf.text(headers[c]!, startX + c * colWidth, pdf.y, {
      width: colWidth - 4,
      continued: c < colCount - 1,
    });
  }
  pdf.moveDown(0.3);

  // Draw header underline
  const lineY = pdf.y;
  pdf
    .moveTo(startX, lineY)
    .lineTo(startX + pageWidth, lineY)
    .lineWidth(0.5)
    .stroke();
  pdf.moveDown(0.3);

  // Data rows
  pdf.font(STYLE.baseFont).fontSize(FONT_SIZES.body);
  for (const row of rows) {
    const rowY = pdf.y;
    for (let c = 0; c < row.cells.length; c++) {
      const cell = row.cells[c]!;
      const cellText = cell.runs.map((r) => r.text).join('');
      pdf.text(cellText, startX + c * colWidth, rowY, {
        width: colWidth - 4,
      });
    }
    pdf.moveDown(0.2);
  }
  pdf.moveDown(0.4);
}

function renderInlineParagraph(pdf: Doc, runs: ExportInline[]): void {
  if (runs.length === 0) {
    pdf.text('');
    return;
  }
  for (let idx = 0; idx < runs.length; idx++) {
    const r = runs[idx]!;
    const isLast = idx === runs.length - 1;
    const font =
      r.kind === 'bold'
        ? STYLE.boldFont
        : r.kind === 'italic'
          ? STYLE.italicFont
          : STYLE.baseFont;
    pdf.font(font).fontSize(FONT_SIZES.body);
    pdf.text(r.text, isLast ? {} : { continued: true });
  }
}

function heading(pdf: Doc, text: string, size: number): void {
  spacer(pdf, size > FONT_SIZES.h3 ? 8 : 4);
  pdf.font(STYLE.boldFont).fontSize(size).text(text);
}

function italicLine(pdf: Doc, text: string): void {
  pdf.font(STYLE.italicFont).fontSize(FONT_SIZES.small).text(text);
}

function spacer(pdf: Doc, height = 6): void {
  pdf.moveDown(height / FONT_SIZES.body);
}
