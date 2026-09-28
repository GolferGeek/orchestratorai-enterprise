/**
 * The admin page every workflow gets (GET /workflows/:slug/admin): the
 * agents it runs (with the org's instruction overrides), its model roles, and
 * the configurable collections ("sections") the workflow declares.
 */
import type { JsonValue } from '../shared/json.types';

export type WorkflowAdminFieldKind = 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'url';

export interface WorkflowAdminField {
  key: string;
  label: string;
  kind: WorkflowAdminFieldKind;
  required: boolean;
  /** Shown, never edited (e.g. a slug the workflow keys on). */
  readOnly?: boolean;
  help?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  options?: Array<{ value: string; label: string }>;
}

export type WorkflowAdminRow = Record<string, JsonValue>;

export interface WorkflowAdminSectionView {
  key: string;
  label: string;
  description: string;
  /** 'list': rows; 'single': one settings record. */
  kind: 'list' | 'single';
  /** The field identifying a row (list sections). */
  idField: string;
  /** The field shown as a row's title. */
  titleField: string;
  fields: WorkflowAdminField[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /**
   * Fields edited for every row at once and saved together (for example
   * weights that must add up). Null when the section has no bulk edit.
   */
  bulk: { label: string; fields: string[] } | null;
}

export interface WorkflowAdminAgentView {
  slug: string;
  name: string;
  description: string | null;
  modelRole: string;
  /** What the agent does in this workflow ('step', 'trace_review', ...). */
  purpose: string;
  defaultInstructions: string;
  /** The org's instructions, or null when it uses the default. */
  overrideInstructions: string | null;
  overrideUpdatedAt: string | null;
}

export interface WorkflowAdminAgentChange {
  instructions: string | null;
  changedBy: string | null;
  changedAt: string;
}

export interface WorkflowAdminView {
  slug: string;
  name: string;
  /** The roles the org chooses a model for (see /workflows/admin/model-profiles). */
  modelRoles: string[];
  agents: WorkflowAdminAgentView[];
  sections: WorkflowAdminSectionView[];
}

/** The model an org chose for one role of one workflow (/workflows/admin/model-profiles). */
export interface WorkflowModelProfile {
  id: string;
  organizationSlug: string;
  workflowSlug: string;
  role: string;
  provider: string;
  model: string;
  updatedBy: string | null;
  updatedAt: string;
}
