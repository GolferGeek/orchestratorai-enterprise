/** One role's model in a run: what callForRole calls. */
export interface RoleModel {
  provider: string;
  model: string;
}

/** The snapshot a run starts with: role → model. */
export type RunModelProfile = Record<string, RoleModel>;

/** A stored per-org profile row. */
export interface ModelProfileRecord {
  id: string;
  organizationSlug: string;
  workflowSlug: string;
  role: string;
  provider: string;
  model: string;
  updatedBy: string | null;
  updatedAt: string;
}

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
