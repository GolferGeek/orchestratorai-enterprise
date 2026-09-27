import type {
  ExportBlock,
  ExportDocument,
  ExportInline,
  ExportListItem,
  ExportNumberedItem,
  ExportSection,
  ExportTableRow,
} from '../export-document';

export function documentToMarkdown(doc: ExportDocument): string {
  const lines: string[] = [];

  lines.push(`# ${doc.title}`);
  lines.push('');

  const metaParts = [
    `Generated ${doc.generatedAt}`,
    ...doc.metadata.map((m) => `${m.label}: ${m.value}`),
  ];
  lines.push(`_${metaParts.join(' · ')}_`);
  lines.push('');

  for (const section of doc.sections) {
    renderSection(lines, section);
  }

  if (doc.footer) {
    lines.push('---');
    lines.push('');
    lines.push(`_${doc.footer}_`);
    lines.push('');
  }

  return lines.join('\n');
}

function renderSection(lines: string[], section: ExportSection): void {
  lines.push(`${'#'.repeat(section.level)} ${section.heading}`);
  lines.push('');
  for (const block of section.blocks) {
    renderBlock(lines, block);
  }
}

function renderBlock(lines: string[], block: ExportBlock): void {
  switch (block.kind) {
    case 'paragraph':
      lines.push(renderInlines(block.runs));
      lines.push('');
      return;
    case 'bullets':
      for (const item of block.items) renderListItem(lines, item);
      lines.push('');
      return;
    case 'definition':
      lines.push(`**${block.label}** ${block.value}`);
      lines.push('');
      return;
    case 'numbered':
      for (let i = 0; i < block.items.length; i++) {
        renderNumberedItem(lines, i + 1, block.items[i]!);
      }
      lines.push('');
      return;
    case 'table':
      renderTable(lines, block.headers, block.rows, block.caption);
      return;
  }
}

function renderListItem(lines: string[], item: ExportListItem): void {
  lines.push(`- ${renderInlines(item.runs)}`);
  if (item.details) {
    for (const d of item.details) {
      lines.push(`  - **${d.label}** ${d.value}`);
    }
  }
}

function renderNumberedItem(
  lines: string[],
  index: number,
  item: ExportNumberedItem,
): void {
  lines.push(`${index}. ${renderInlines(item.primary)}`);
  for (const d of item.details) {
    lines.push(`   - _${d.label}:_ ${d.value}`);
  }
}

function escapeTableCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function renderTable(
  lines: string[],
  headers: string[],
  rows: ExportTableRow[],
  caption?: string,
): void {
  if (caption) {
    lines.push(`_${caption}_`);
    lines.push('');
  }
  lines.push(`| ${headers.map(escapeTableCell).join(' | ')} |`);
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
  for (const row of rows) {
    const cells = row.cells.map((c) => escapeTableCell(renderInlines(c.runs)));
    lines.push(`| ${cells.join(' | ')} |`);
  }
  lines.push('');
}

function renderInlines(runs: ExportInline[]): string {
  return runs
    .map((r) => {
      if (r.kind === 'bold') return `**${r.text}**`;
      if (r.kind === 'italic') return `_${r.text}_`;
      return r.text;
    })
    .join('');
}
