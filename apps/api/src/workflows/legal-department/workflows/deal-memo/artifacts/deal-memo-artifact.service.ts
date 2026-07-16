/**
 * DealMemoArtifactService — persists the finalized deal memo to the
 * existing `legal-documents` bucket in two formats:
 *
 *   {memoJobId}/deal-memo.md    (raw markdown — source of truth)
 *   {memoJobId}/deal-memo.docx  (mechanical render of the markdown)
 *
 * Uses MEDIA_STORAGE_PROVIDER from the storage plane, so the same code
 * works against Supabase, Azure Blob, and GCS.
 *
 * ## MD → DOCX library choice
 *
 * The repo had no MD→DOCX converter at the start of Phase 4. The DD
 * Deal Memo PRD (§4.5) explicitly permits adding a single dependency
 * for this purpose. We chose two small, pure-JS packages:
 *
 *   - `marked@^15` — same version already in use by forge-web for memo
 *     rendering; tokenizes markdown into a structured AST.
 *   - `docx@^9` — dolanmiu's pure-TS DOCX builder; no native deps,
 *     MIT, maintained. Takes the marked AST and emits a .docx Buffer.
 *
 * Two well-trodden pure-JS deps beat one less-maintained single-shot
 * package (e.g. `md-to-docx`). The pairing also lets us reuse the
 * forge-web markdown version pin for consistency.
 *
 * DOCX fidelity is intentionally mechanical — the memo markdown is the
 * legal source of truth per PRD §5. This renderer supports H1–H3
 * headings, paragraphs (with bold/italic inline), and bullet / ordered
 * lists. Anything richer (tables, blockquotes) degrades to a paragraph
 * rather than being dropped, so nothing is silently lost.
 *
 * ## Failure behavior
 *
 * Every method throws on storage or conversion error. Callers (memo
 * finalize node, download endpoint) propagate the throw so the job
 * transitions to `failed` with the original error message — no silent
 * fallback, per the project-root CLAUDE.md "NO FALLBACKS" rule.
 */
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  MEDIA_STORAGE_PROVIDER,
  type MediaStorageProvider,
} from '@orchestratorai/planes/storage';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { marked, type Tokens } from 'marked';

const BUCKET = 'legal-documents';

/**
 * Content-type strings used for both upload (Supabase MIME allowlist
 * enforcement) and download (HTTP Content-Type header). Matches the
 * `legal-documents` bucket's allowed_mime_types — Supabase does an exact
 * string match, so any `; charset=utf-8` suffix would be rejected.
 */
export const MEMO_ARTIFACT_CONTENT_TYPES = {
  md: 'text/markdown',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

export type MemoArtifactFormat = keyof typeof MEMO_ARTIFACT_CONTENT_TYPES;

@Injectable()
export class DealMemoArtifactService implements OnModuleInit {
  private readonly logger = new Logger(DealMemoArtifactService.name);

  constructor(
    @Inject(MEDIA_STORAGE_PROVIDER)
    private readonly storage: MediaStorageProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    // The legal-documents bucket is also ensured by LegalDocumentsStorageService
    // (for DD uploads). Calling ensureBucketExists twice is idempotent.
    try {
      await this.storage.ensureBucketExists(BUCKET, {
        public: false,
        fileSizeLimit: 50 * 1024 * 1024,
      });
    } catch (error) {
      // Same rationale as LegalDocumentsStorageService: warn and let the
      // first upload surface the real issue rather than failing module init.
      this.logger.warn(
        `Failed to ensure bucket '${BUCKET}' exists: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  memoMarkdownPath(memoJobId: string): string {
    return `${memoJobId}/deal-memo.md`;
  }

  memoDocxPath(memoJobId: string): string {
    return `${memoJobId}/deal-memo.docx`;
  }

  /**
   * Write the memo markdown to `{memoJobId}/deal-memo.md` and return
   * the bucket-relative path. Throws if the upload fails.
   */
  async uploadMemoMarkdown(
    memoJobId: string,
    markdown: string,
  ): Promise<string> {
    if (!markdown || markdown.trim().length === 0) {
      throw new Error(
        'DealMemoArtifactService.uploadMemoMarkdown: markdown is empty — refusing to write a zero-byte artifact.',
      );
    }
    const path = this.memoMarkdownPath(memoJobId);
    const data = Buffer.from(markdown, 'utf8');
    await this.storage.upload(BUCKET, path, data, {
      contentType: MEMO_ARTIFACT_CONTENT_TYPES.md,
      upsert: true,
    });
    this.logger.log(`Stored memo MD ${path} (${data.length} bytes)`);
    return path;
  }

  /**
   * Convert the memo markdown to DOCX in memory, write it to
   * `{memoJobId}/deal-memo.docx`, and return the bucket-relative path.
   * Throws if conversion or upload fails.
   */
  async uploadMemoDocx(memoJobId: string, markdown: string): Promise<string> {
    if (!markdown || markdown.trim().length === 0) {
      throw new Error(
        'DealMemoArtifactService.uploadMemoDocx: markdown is empty — refusing to write a zero-byte artifact.',
      );
    }
    const buffer = await this.renderMarkdownToDocx(markdown);
    const path = this.memoDocxPath(memoJobId);
    await this.storage.upload(BUCKET, path, buffer, {
      contentType: MEMO_ARTIFACT_CONTENT_TYPES.docx,
      upsert: true,
    });
    this.logger.log(`Stored memo DOCX ${path} (${buffer.length} bytes)`);
    return path;
  }

  /**
   * Read an artifact back from storage. The download endpoint streams
   * these bytes through a tenant-scoped proxy — we never expose a
   * signed URL (see LegalDocumentsStorageService rationale).
   */
  async downloadArtifact(
    path: string,
  ): Promise<{ data: Buffer; contentType: string }> {
    return this.storage.download(BUCKET, path);
  }

  /**
   * Render markdown → DOCX buffer. Exported for tests.
   */
  async renderMarkdownToDocx(markdown: string): Promise<Buffer> {
    const tokens = marked.lexer(markdown);
    const paragraphs: Paragraph[] = [];
    for (const token of tokens) {
      appendTokenAsParagraphs(token, paragraphs);
    }
    // docx requires at least one paragraph; guard against pathological empty input.
    if (paragraphs.length === 0) {
      paragraphs.push(new Paragraph({ children: [new TextRun('')] }));
    }
    const doc = new Document({
      creator: 'OrchestratorAI Legal — Deal Memo Generator',
      title: 'Deal Memo',
      sections: [{ properties: {}, children: paragraphs }],
    });
    return Packer.toBuffer(doc);
  }
}

// ── Markdown → DOCX helpers ────────────────────────────────────────────

function appendTokenAsParagraphs(
  token: Tokens.Generic | Tokens.Heading | Tokens.Paragraph | Tokens.List,
  out: Paragraph[],
): void {
  switch (token.type) {
    case 'heading': {
      const h = token as Tokens.Heading;
      out.push(
        new Paragraph({
          heading: headingLevelFor(h.depth),
          children: renderInline(h.tokens ?? []),
        }),
      );
      return;
    }
    case 'paragraph': {
      const p = token as Tokens.Paragraph;
      out.push(new Paragraph({ children: renderInline(p.tokens ?? []) }));
      return;
    }
    case 'list': {
      const list = token as Tokens.List;
      for (const item of list.items) {
        out.push(
          new Paragraph({
            bullet: list.ordered ? undefined : { level: 0 },
            numbering: list.ordered
              ? { reference: 'memo-numbering', level: 0 }
              : undefined,
            children: renderInline(item.tokens ?? []),
          }),
        );
      }
      return;
    }
    case 'space':
      out.push(new Paragraph({ children: [new TextRun('')] }));
      return;
    case 'hr':
      out.push(
        new Paragraph({
          children: [new TextRun({ text: '———', bold: true })],
        }),
      );
      return;
    case 'blockquote': {
      const bq = token as Tokens.Blockquote;
      for (const inner of bq.tokens ?? []) {
        appendTokenAsParagraphs(inner, out);
      }
      return;
    }
    case 'code': {
      const c = token as Tokens.Code;
      // Preformatted blocks render as a single paragraph with line breaks.
      const lines = c.text.split('\n');
      out.push(
        new Paragraph({
          children: lines.flatMap((line, i) => {
            const runs: TextRun[] = [
              new TextRun({ text: line, font: 'Courier New' }),
            ];
            if (i < lines.length - 1) {
              runs.push(new TextRun({ text: '', break: 1 }));
            }
            return runs;
          }),
        }),
      );
      return;
    }
    default: {
      // Fallthrough: render raw text if available so we never silently drop content.
      const raw = (token as { raw?: string }).raw;
      if (raw && raw.trim().length > 0) {
        out.push(new Paragraph({ children: [new TextRun(raw)] }));
      }
      return;
    }
  }
}

function headingLevelFor(
  depth: number,
): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  switch (depth) {
    case 1:
      return HeadingLevel.HEADING_1;
    case 2:
      return HeadingLevel.HEADING_2;
    case 3:
      return HeadingLevel.HEADING_3;
    case 4:
      return HeadingLevel.HEADING_4;
    case 5:
      return HeadingLevel.HEADING_5;
    default:
      return HeadingLevel.HEADING_6;
  }
}

function renderInline(tokens: Tokens.Generic[]): TextRun[] {
  const runs: TextRun[] = [];
  for (const token of tokens) {
    collectInline(token, runs, {});
  }
  if (runs.length === 0) {
    runs.push(new TextRun(''));
  }
  return runs;
}

interface InlineStyle {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  font?: string;
}

function collectInline(
  token: Tokens.Generic,
  out: TextRun[],
  style: InlineStyle,
): void {
  switch (token.type) {
    case 'text': {
      const t = token as Tokens.Text;
      if (t.tokens && t.tokens.length > 0) {
        for (const inner of t.tokens) collectInline(inner, out, style);
      } else {
        out.push(new TextRun({ text: t.text, ...style }));
      }
      return;
    }
    case 'strong': {
      const s = token as Tokens.Strong;
      for (const inner of s.tokens ?? []) {
        collectInline(inner, out, { ...style, bold: true });
      }
      return;
    }
    case 'em': {
      const em = token as Tokens.Em;
      for (const inner of em.tokens ?? []) {
        collectInline(inner, out, { ...style, italics: true });
      }
      return;
    }
    case 'del': {
      const d = token as Tokens.Del;
      for (const inner of d.tokens ?? []) {
        collectInline(inner, out, { ...style, strike: true });
      }
      return;
    }
    case 'codespan': {
      const c = token as Tokens.Codespan;
      out.push(new TextRun({ text: c.text, ...style, font: 'Courier New' }));
      return;
    }
    case 'link': {
      const link = token as Tokens.Link;
      // Render link text as italic underline-ish (no URL decoration in DOCX v1).
      for (const inner of link.tokens ?? []) {
        collectInline(inner, out, { ...style, italics: true });
      }
      return;
    }
    case 'br':
      out.push(new TextRun({ text: '', break: 1 }));
      return;
    default: {
      const raw =
        (token as { raw?: string; text?: string }).text ??
        (token as { raw?: string }).raw;
      if (raw) {
        out.push(new TextRun({ text: raw, ...style }));
      }
      return;
    }
  }
}
