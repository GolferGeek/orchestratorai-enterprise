import { Injectable, Logger } from '@nestjs/common';
import {
  IDocumentExtractor,
  ExtractionResult,
} from './document-extractor.interface';

/**
 * CsvExtractorService — turns a CSV buffer into a markdown-style table so the
 * LLM can read it as structure rather than as a wall of commas.
 *
 * Pure-JS, no dependencies. Handles RFC 4180 quoted fields with embedded
 * commas, embedded newlines, and escaped quotes ("").
 *
 * For very large files (> ~1000 rows) the markdown table is truncated and a
 * `truncated` flag goes into metadata; the LLM gets a representative slice
 * plus the row/column count.
 */
@Injectable()
export class CsvExtractorService implements IDocumentExtractor {
  private readonly logger = new Logger(CsvExtractorService.name);
  private static readonly MAX_ROWS_IN_OUTPUT = 1000;

  isAvailable(): boolean {
    return true;
  }

  extract(buffer: Buffer): Promise<ExtractionResult> {
    const raw = buffer.toString('utf-8').replace(/^\uFEFF/, '');
    const rows = this.parseCsv(raw);

    const totalRows = rows.length;
    const totalCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
    const truncated = totalRows > CsvExtractorService.MAX_ROWS_IN_OUTPUT;
    const visibleRows = truncated
      ? rows.slice(0, CsvExtractorService.MAX_ROWS_IN_OUTPUT)
      : rows;

    const text = this.toMarkdownTable(visibleRows);
    if (truncated) {
      this.logger.debug(
        `CSV truncated: ${totalRows} rows → ${CsvExtractorService.MAX_ROWS_IN_OUTPUT}`,
      );
    }

    return Promise.resolve({
      text,
      metadata: {
        extractor: 'csv',
        rowCount: totalRows,
        columnCount: totalCols,
        truncated,
        ...(truncated && {
          truncatedAt: CsvExtractorService.MAX_ROWS_IN_OUTPUT,
        }),
      },
    });
  }

  async extractText(buffer: Buffer): Promise<string> {
    const result = await this.extract(buffer);
    return result.text;
  }

  /**
   * Minimal RFC 4180 CSV parser. Handles quoted fields, embedded commas,
   * embedded newlines, and "" → " escapes. Ignores trailing empty lines.
   */
  private parseCsv(input: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    let i = 0;
    while (i < input.length) {
      const ch = input[i];
      if (inQuotes) {
        if (ch === '"') {
          if (input[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i++;
          continue;
        }
        field += ch;
        i++;
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (ch === ',') {
        row.push(field);
        field = '';
        i++;
        continue;
      }
      if (ch === '\r') {
        i++;
        continue;
      }
      if (ch === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i++;
        continue;
      }
      field += ch;
      i++;
    }
    // Final field/row
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    // Drop fully-empty trailing rows
    while (rows.length > 0) {
      const last = rows[rows.length - 1];
      if (last && last.every((c) => c === '')) {
        rows.pop();
      } else {
        break;
      }
    }
    return rows;
  }

  private toMarkdownTable(rows: string[][]): string {
    if (rows.length === 0) return '';
    const header = rows[0] ?? [];
    const body = rows.slice(1);
    const escape = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const lines: string[] = [];
    lines.push('| ' + header.map(escape).join(' | ') + ' |');
    lines.push('| ' + header.map(() => '---').join(' | ') + ' |');
    for (const r of body) {
      // pad short rows so the table stays rectangular
      const padded = [...r];
      while (padded.length < header.length) padded.push('');
      lines.push('| ' + padded.map(escape).join(' | ') + ' |');
    }
    return lines.join('\n');
  }
}
