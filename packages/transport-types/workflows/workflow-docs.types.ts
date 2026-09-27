import type { JsonValue } from '../shared/json.types';

/**
 * A workflow's own documentation, kept as markdown next to its code
 * (`src/workflows/<slug>/docs/`) and edited through git.
 */
export const WORKFLOW_DOC_NAMES = ['user-guide', 'smoke-test'] as const;
export type WorkflowDocName = (typeof WORKFLOW_DOC_NAMES)[number];

/** A worked example (`docs/showcase/<case>/case.json`): the input a person can start a run with. */
export interface WorkflowShowcaseCase {
  caseSlug: string;
  title: string;
  summary: string;
  input: JsonValue;
}

/** GET /workflows/:slug/brief */
export interface WorkflowBrief {
  slug: string;
  /** The brief's H1. */
  title: string;
  /** The brief without its H1: what the workflow does, how, and why it helps. */
  markdown: string;
  /** Which further docs exist for GET /workflows/:slug/docs/:name. */
  docs: WorkflowDocName[];
  showcase: WorkflowShowcaseCase[];
}

/** GET /workflows/:slug/docs/:name */
export interface WorkflowDoc {
  name: WorkflowDocName;
  markdown: string;
}
