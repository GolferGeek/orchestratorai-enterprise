/**
 * Workflow export — typed intermediate document model (ported from local's
 * export plane; here it is an app module, not an infrastructure plane).
 *
 * Workflows produce an `ExportDocument` from their finished state, and
 * the export service serializes that document to Markdown / DOCX / PDF. The
 * intermediate is intentionally narrow — only the primitives any
 * report actually needs.
 *
 * Adding a workflow-specific shape? Don't extend this model — build
 * an adapter from your workflow's typed result to ExportDocument.
 * That keeps the serializers workflow-agnostic.
 */

export interface ExportDocument {
  /** Document title — rendered as the H1. */
  title: string;
  /** ISO timestamp included in the metadata header. */
  generatedAt: string;
  /** Free-form label/value pairs displayed in the metadata header. */
  metadata: Array<{ label: string; value: string }>;
  /** Ordered top-level sections. */
  sections: ExportSection[];
  /** Optional one-line italic footer. */
  footer?: string;
}

export interface ExportSection {
  heading: string;
  /** H2 to H4. H1 is reserved for the document title. */
  level: 2 | 3 | 4;
  blocks: ExportBlock[];
}

export type ExportBlock =
  | { kind: 'paragraph'; runs: ExportInline[] }
  | { kind: 'bullets'; items: ExportListItem[] }
  | { kind: 'definition'; label: string; value: string }
  | { kind: 'numbered'; items: ExportNumberedItem[] }
  | {
      kind: 'table';
      headers: string[];
      rows: ExportTableRow[];
      caption?: string;
    };

export interface ExportTableCell {
  runs: ExportInline[];
}

export interface ExportTableRow {
  cells: ExportTableCell[];
}

export type ExportInline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string };

export interface ExportListItem {
  runs: ExportInline[];
  /** Indented label/value pairs nested under this bullet. */
  details?: Array<{ label: string; value: string }>;
}

export interface ExportNumberedItem {
  primary: ExportInline[];
  details: Array<{ label: string; value: string }>;
}

export type ExportFormat = 'md' | 'docx' | 'pdf';

export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  md: 'text/markdown; charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
};

export const EXPORT_FILE_EXTENSIONS: Record<ExportFormat, string> = {
  md: 'md',
  docx: 'docx',
  pdf: 'pdf',
};

// ── Tiny inline-run helpers for adapter authors ──────────────────────

export const t = (text: string): ExportInline => ({ kind: 'text', text });
export const b = (text: string): ExportInline => ({ kind: 'bold', text });
export const i = (text: string): ExportInline => ({ kind: 'italic', text });
