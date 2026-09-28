import type { JsonValue, WorkflowAdminField, WorkflowAdminMatrix, WorkflowAdminRow, WorkflowAdminSectionView } from '@orchestrator-ai/transport-types';

/** A workflow's configurable collection. Absent operations are not offered. */
export interface WorkflowAdminSection {
  key: string;
  label: string;
  description: string;
  kind: 'list' | 'single' | 'matrix';
  idField: string;
  titleField: string;
  fields: WorkflowAdminField[];
  /** The rows (list and single sections; a matrix section has none). */
  list?(organizationSlug: string): Promise<WorkflowAdminRow[]>;
  create?(organizationSlug: string, row: WorkflowAdminRow, userId: string): Promise<WorkflowAdminRow>;
  update?(organizationSlug: string, id: string, row: WorkflowAdminRow, userId: string): Promise<WorkflowAdminRow>;
  remove?(organizationSlug: string, id: string): Promise<boolean>;
  /** Edit `fields` of every row at once (a table), saved in one go. */
  bulk?: {
    label: string;
    fields: string[];
    save(organizationSlug: string, rows: Array<{ id: string; row: WorkflowAdminRow }>, userId: string): Promise<WorkflowAdminRow[]>;
  };
  /** A 'matrix' section: load and save every cell; the API checks the range and the shape. */
  matrix?: {
    min: number;
    max: number;
    help: string;
    load(organizationSlug: string): Promise<WorkflowAdminMatrix>;
    save(organizationSlug: string, rows: Array<{ id: string; cells: Record<string, number> }>, userId: string): Promise<WorkflowAdminMatrix>;
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
    matrix: section.matrix ? { min: section.matrix.min, max: section.matrix.max, help: section.matrix.help } : null,
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

/**
 * Matrix cells from the admin, checked against what the section holds now:
 * every row and column known, every cell a number in range. Rows not sent
 * are left as they are.
 */
export function validateMatrix(
  current: WorkflowAdminMatrix,
  input: unknown,
  range: { min: number; max: number },
): Array<{ id: string; cells: Record<string, number> }> {
  if (!Array.isArray(input) || !input.length) throw new AdminRowError('rows must be a non-empty list');
  const rowIds = new Set(current.rows.map((r) => r.id));
  const columns = new Set(current.columns.map((c) => c.key));
  const seen = new Set<string>();
  return input.map((entry: unknown) => {
    const e = entry as { id?: unknown; cells?: unknown };
    if (typeof e.id !== 'string' || !rowIds.has(e.id)) throw new AdminRowError(`No row ${String(e.id)}`);
    if (seen.has(e.id)) throw new AdminRowError(`${e.id} is listed twice`);
    seen.add(e.id);
    if (typeof e.cells !== 'object' || e.cells === null || Array.isArray(e.cells)) throw new AdminRowError(`${e.id}: cells must be an object`);
    const cells: Record<string, number> = {};
    for (const [key, value] of Object.entries(e.cells as Record<string, unknown>)) {
      if (!columns.has(key)) throw new AdminRowError(`No column ${key}`);
      if (typeof value !== 'number' || !Number.isFinite(value) || value < range.min || value > range.max) {
        throw new AdminRowError(`${e.id} / ${key} must be a number from ${range.min} to ${range.max}`);
      }
      cells[key] = value;
    }
    return { id: e.id, cells };
  });
}
