import type { JsonValue, WorkflowAdminField, WorkflowAdminRow, WorkflowAdminSectionView } from '@orchestrator-ai/transport-types';

/** A workflow's configurable collection. Absent operations are not offered. */
export interface WorkflowAdminSection {
  key: string;
  label: string;
  description: string;
  kind: 'list' | 'single';
  idField: string;
  titleField: string;
  fields: WorkflowAdminField[];
  list(organizationSlug: string): Promise<WorkflowAdminRow[]>;
  create?(organizationSlug: string, row: WorkflowAdminRow, userId: string): Promise<WorkflowAdminRow>;
  update?(organizationSlug: string, id: string, row: WorkflowAdminRow, userId: string): Promise<WorkflowAdminRow>;
  remove?(organizationSlug: string, id: string): Promise<boolean>;
  /** Edit `fields` of every row at once (a table), saved in one go. */
  bulk?: {
    label: string;
    fields: string[];
    save(organizationSlug: string, rows: Array<{ id: string; row: WorkflowAdminRow }>, userId: string): Promise<WorkflowAdminRow[]>;
  };
}

export function sectionView(section: WorkflowAdminSection): WorkflowAdminSectionView {
  return {
    key: section.key,
    label: section.label,
    description: section.description,
    kind: section.kind,
    idField: section.idField,
    titleField: section.titleField,
    fields: section.fields,
    canCreate: !!section.create,
    canUpdate: !!section.update,
    canDelete: !!section.remove,
    bulk: section.bulk ? { label: section.bulk.label, fields: section.bulk.fields } : null,
  };
}

export class AdminRowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminRowError';
  }
}

/**
 * A row from the admin form, checked against the section's fields. Unknown
 * fields are refused; read-only fields are the workflow's to set, so they
 * are dropped (the form sends whole rows back), as are fields outside
 * `editable` when it is given. Optional fields may be null.
 */
export function validateRow(fields: WorkflowAdminField[], input: unknown, options: { editable?: string[] } = {}): WorkflowAdminRow {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new AdminRowError('The row must be an object');
  const body = input as Record<string, unknown>;
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const unknown = Object.keys(body).filter((k) => !byKey.has(k));
  if (unknown.length) throw new AdminRowError(`Unknown fields: ${unknown.join(', ')}`);
  const row: WorkflowAdminRow = {};
  for (const field of fields) {
    if (field.readOnly) continue;
    // Fields edited elsewhere (a section's bulk fields, on a row update) are dropped too.
    if (options.editable && !options.editable.includes(field.key)) continue;
    const value = body[field.key];
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
      if (field.required && field.kind !== 'boolean') throw new AdminRowError(`${field.label} is required`);
      if (field.kind === 'boolean') {
        if (field.required) throw new AdminRowError(`${field.label} is required`);
        row[field.key] = null;
        continue;
      }
      row[field.key] = null;
      continue;
    }
    row[field.key] = checked(field, value);
  }
  return row;
}

function checked(field: WorkflowAdminField, value: unknown): JsonValue {
  switch (field.kind) {
    case 'boolean':
      if (typeof value !== 'boolean') throw new AdminRowError(`${field.label} must be true or false`);
      return value;
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new AdminRowError(`${field.label} must be a number`);
      if (field.min !== undefined && value < field.min) throw new AdminRowError(`${field.label} must be at least ${field.min}`);
      if (field.max !== undefined && value > field.max) throw new AdminRowError(`${field.label} must be at most ${field.max}`);
      return value;
    }
    case 'select': {
      if (typeof value !== 'string' || !field.options?.some((o) => o.value === value)) {
        throw new AdminRowError(`${field.label} must be one of ${(field.options ?? []).map((o) => o.value).join(', ')}`);
      }
      return value;
    }
    case 'text':
    case 'textarea':
    case 'url': {
      if (typeof value !== 'string') throw new AdminRowError(`${field.label} must be text`);
      const text = value.trim();
      if (field.maxLength !== undefined && text.length > field.maxLength) throw new AdminRowError(`${field.label} must be at most ${field.maxLength} characters`);
      if (field.kind === 'url') {
        let url: URL;
        try {
          url = new URL(text);
        } catch {
          throw new AdminRowError(`${field.label} must be a URL`);
        }
        if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new AdminRowError(`${field.label} must be an http(s) URL`);
      }
      return text;
    }
  }
}
