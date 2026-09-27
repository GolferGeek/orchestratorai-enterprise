import { Injectable } from '@nestjs/common';
import type { ExportDocument, ExportFormat } from './export-document';
import { documentToDocx } from './serializers/document-to-docx';
import { documentToMarkdown } from './serializers/document-to-markdown';
import { documentToPdf } from './serializers/document-to-pdf';

/** Renders a workflow's ExportDocument to Markdown, Word, or PDF bytes. */
@Injectable()
export class ExportService {
  async render(doc: ExportDocument, format: ExportFormat): Promise<Buffer> {
    switch (format) {
      case 'md':
        return Buffer.from(documentToMarkdown(doc), 'utf-8');
      case 'docx':
        return documentToDocx(doc);
      case 'pdf':
        return documentToPdf(doc);
    }
  }
}
