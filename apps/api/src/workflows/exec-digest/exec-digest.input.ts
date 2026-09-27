import type { JsonValue } from '@orchestrator-ai/transport-types';
import { WorkflowInputError } from '../catalog/workflow.registry';

export const EXEC_DIGEST_SLUG = 'exec-digest';

/** The departments a digest can cover. */
export const DIGEST_ORGANIZATIONS = ['corporate', 'finance', 'human-resources', 'marketing', 'engineering', 'building'] as const;
export type DigestOrganization = (typeof DIGEST_ORGANIZATIONS)[number];

export interface ExecDigestInput {
  /** The last day of the week (YYYY-MM-DD). Absent: the week ending on the day the run starts. */
  weekEnding: string | null;
  organizations: DigestOrganization[];
}

/** `start` input: { organizations: [...], weekEnding?: 'YYYY-MM-DD' }, nothing else. */
export function parseExecDigestInput(input: JsonValue): ExecDigestInput {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new WorkflowInputError('input must be an object with organizations');
  }
  const extra = Object.keys(input).filter((k) => k !== 'organizations' && k !== 'weekEnding');
  if (extra.length) throw new WorkflowInputError(`input has unknown fields: ${extra.join(', ')}`);
  const { organizations, weekEnding } = input;
  if (!Array.isArray(organizations) || organizations.length === 0) {
    throw new WorkflowInputError('input.organizations must list at least one department');
  }
  for (const org of organizations) {
    if (!(DIGEST_ORGANIZATIONS as readonly unknown[]).includes(org)) {
      throw new WorkflowInputError(`input.organizations: "${String(org)}" is not one of ${DIGEST_ORGANIZATIONS.join(', ')}`);
    }
  }
  if (new Set(organizations).size !== organizations.length) throw new WorkflowInputError('input.organizations lists a department twice');
  if (weekEnding !== undefined && weekEnding !== null) {
    if (typeof weekEnding !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(weekEnding) || Number.isNaN(Date.parse(`${weekEnding}T00:00:00Z`))) {
      throw new WorkflowInputError('input.weekEnding must be a date as YYYY-MM-DD');
    }
  }
  return { weekEnding: typeof weekEnding === 'string' ? weekEnding : null, organizations: organizations as DigestOrganization[] };
}

export function execDigestRunTitle(input: JsonValue): string {
  const { weekEnding, organizations } = parseExecDigestInput(input);
  const scope = organizations.length === DIGEST_ORGANIZATIONS.length ? 'all departments' : organizations.join(', ');
  return `Exec digest${weekEnding ? ` - week ending ${weekEnding}` : ''} (${scope})`;
}

/** The seven days ending on `weekEnding` (inclusive), as a half-open UTC range. */
export function weekWindow(weekEnding: string): { from: string; to: string } {
  const end = new Date(`${weekEnding}T00:00:00Z`);
  const to = new Date(end.getTime() + 24 * 3600 * 1000);
  const from = new Date(to.getTime() - 7 * 24 * 3600 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}
