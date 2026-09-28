import type { WorkflowModelProfile } from '@orchestrator-ai/transport-types';
/** One role's model in a run: what callForRole calls. */
export interface RoleModel {
  provider: string;
  model: string;
}

/** The snapshot a run starts with: role → model. */
export type RunModelProfile = Record<string, RoleModel>;

/** A stored per-org profile row. */
/** One org's model for one role of one workflow (shared with the web). */
export type ModelProfileRecord = WorkflowModelProfile;

/** A workflow cannot start because roles have no model in this org. */
export class MissingModelProfileError extends Error {
  constructor(
    readonly workflowSlug: string,
    readonly organizationSlug: string,
    readonly roles: string[],
  ) {
    super(
      `Workflow "${workflowSlug}" has no model configured in organization "${organizationSlug}" for: ${roles.join(', ')}`,
    );
    this.name = 'MissingModelProfileError';
  }
}

function isRoleModel(value: unknown): value is RoleModel {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).provider === 'string' &&
    typeof (value as Record<string, unknown>).model === 'string'
  );
}

/** Validate a stored run snapshot. Throws on anything malformed. */
export function toRunModelProfile(value: unknown): RunModelProfile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('workflows.runs.model_profile is not an object');
  }
  const profile: RunModelProfile = {};
  for (const [role, model] of Object.entries(value)) {
    if (!isRoleModel(model)) {
      throw new Error(`workflows.runs.model_profile.${role} is not a provider/model pair`);
    }
    profile[role] = { provider: model.provider, model: model.model };
  }
  return profile;
}

/** A chosen local model is not installed on the Ollama host, so it cannot run. */
export class ModelUnavailableError extends Error {
  constructor(readonly unavailable: Array<{ role: string | null; provider: string; model: string }>) {
    super(
      `Not available on the local model host: ${unavailable
        .map((u) => `${u.provider}/${u.model}${u.role ? ` (role ${u.role})` : ''}`)
        .join(', ')}`,
    );
    this.name = 'ModelUnavailableError';
  }
}

/**
 * The role every runtime workflow's trace reviewer runs on. It is configured
 * like the workflow's own roles but is not needed to start a run.
 */
export const TRACE_REVIEWER_ROLE = 'reviewer';

/** The roles an org can set a model for: the workflow's own, and its reviewer's. */
export function configurableRoles(modelRoles: readonly string[]): string[] {
  return [...modelRoles, TRACE_REVIEWER_ROLE];
}
