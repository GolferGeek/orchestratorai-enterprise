/**
 * The workflow catalog as an org sees it (`GET /workflows`): each workflow
 * with the org's settings applied, and the org's groups for the nav.
 */

export const WORKFLOW_LIFECYCLES = ['newly_created', 'dev', 'test', 'prod'] as const;
export type WorkflowLifecycle = (typeof WORKFLOW_LIFECYCLES)[number];

export const DATA_CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
export type DataClassification = (typeof DATA_CLASSIFICATIONS)[number];

export function isWorkflowLifecycle(value: unknown): value is WorkflowLifecycle {
  return typeof value === 'string' && (WORKFLOW_LIFECYCLES as readonly string[]).includes(value);
}

export interface WorkflowCatalogEntry {
  slug: string;
  name: string;
  description: string | null;
  /** An icon name the web kit maps to an icon. */
  icon: string;
  /** Whether the workflow stops for people (human gates). */
  hitl: boolean;
  dataClassification: DataClassification;
  /** The org's setting, else the workflow's default. */
  lifecycle: WorkflowLifecycle;
  enabled: boolean;
  note: string | null;
  /** The org group it is in, else its default group name. */
  group: string;
}

export interface WorkflowGroupView {
  /** Null for a default group the org has not created. */
  id: string | null;
  name: string;
  position: number;
  workflowSlugs: string[];
}

export interface WorkflowCatalogView {
  workflows: WorkflowCatalogEntry[];
  /** In nav order; every catalog workflow appears in exactly one. */
  groups: WorkflowGroupView[];
}
