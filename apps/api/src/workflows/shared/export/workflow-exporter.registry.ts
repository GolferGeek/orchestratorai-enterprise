import { Injectable } from '@nestjs/common';
import type { IssueLedgerView } from '@orchestrator-ai/transport-types';
import type { WorkflowRunRecord } from '../runs';
import type { ExportDocument } from './export-document';

/** What an exporter gets: the completed run and its issue ledger. */
export interface ExportSource {
  run: WorkflowRunRecord;
  issues: IssueLedgerView;
  exportedAt: Date;
}

/**
 * A workflow's export hook: builds the document from a completed run. The
 * workflow owns the shape of its report; the serializers own the formats.
 */
export interface WorkflowExporter {
  slug: string;
  /** The download's base file name, without extension. */
  fileName(source: ExportSource): string;
  build(source: ExportSource): ExportDocument;
}

/** Exporters by workflow slug; a workflow module registers its own on init. */
@Injectable()
export class WorkflowExporterRegistry {
  private readonly exporters = new Map<string, WorkflowExporter>();

  register(exporter: WorkflowExporter): void {
    if (this.exporters.has(exporter.slug)) {
      throw new Error(`An exporter for workflow "${exporter.slug}" is already registered`);
    }
    this.exporters.set(exporter.slug, exporter);
  }

  get(slug: string): WorkflowExporter | undefined {
    return this.exporters.get(slug);
  }
}
