import { Injectable } from '@nestjs/common';
import type { WorkflowAdminSection } from './workflow-admin-section';

/** Each workflow registers its admin sections at boot (like its exporter). */
@Injectable()
export class WorkflowAdminRegistry {
  private readonly bySlug = new Map<string, WorkflowAdminSection[]>();

  register(workflowSlug: string, sections: WorkflowAdminSection[]): void {
    if (this.bySlug.has(workflowSlug)) throw new Error(`Admin sections for ${workflowSlug} are already registered`);
    const keys = sections.map((s) => s.key);
    if (new Set(keys).size !== keys.length) throw new Error(`Admin sections for ${workflowSlug} repeat a key: ${keys.join(', ')}`);
    for (const s of sections) {
      if (!s.fields.some((f) => f.key === s.idField) || !s.fields.some((f) => f.key === s.titleField)) {
        throw new Error(`Admin section ${workflowSlug}/${s.key}: idField and titleField must be fields`);
      }
      const editable = new Set(s.fields.filter((f) => !f.readOnly).map((f) => f.key));
      if (s.bulk && (!s.bulk.fields.length || s.bulk.fields.some((f) => !editable.has(f)))) {
        throw new Error(`Admin section ${workflowSlug}/${s.key}: bulk fields must be editable fields`);
      }
    }
    this.bySlug.set(workflowSlug, sections);
  }

  sections(workflowSlug: string): WorkflowAdminSection[] {
    return this.bySlug.get(workflowSlug) ?? [];
  }

  section(workflowSlug: string, key: string): WorkflowAdminSection | undefined {
    return this.sections(workflowSlug).find((s) => s.key === key);
  }
}
