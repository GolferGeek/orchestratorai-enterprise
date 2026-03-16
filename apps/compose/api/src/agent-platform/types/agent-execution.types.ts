export type AgentExecutionProfile =
  | 'conversation_only'
  | 'autonomous_build'
  | 'human_gate'
  | 'conversation_with_gate';

export interface AgentExecutionCapabilities {
  can_converse: boolean;
  can_plan: boolean;
  can_build: boolean;
  requires_human_gate: boolean;
}

export interface AgentExecutionMetadata {
  profile: AgentExecutionProfile;
  capabilities: AgentExecutionCapabilities;
}

export const DEFAULT_EXECUTION_PROFILE: AgentExecutionProfile =
  'autonomous_build';

export const DEFAULT_EXECUTION_CAPABILITIES: AgentExecutionCapabilities = {
  can_converse: true,
  can_plan: true,
  can_build: true,
  requires_human_gate: false,
};

export const EXECUTION_PROFILE_CAPABILITIES: Record<
  AgentExecutionProfile,
  AgentExecutionCapabilities
> = {
  conversation_only: {
    can_converse: true,
    can_plan: false,
    can_build: false,
    requires_human_gate: false,
  },
  autonomous_build: { ...DEFAULT_EXECUTION_CAPABILITIES },
  human_gate: {
    can_converse: true,
    can_plan: true,
    can_build: true,
    requires_human_gate: true,
  },
  conversation_with_gate: {
    can_converse: true,
    can_plan: false,
    can_build: false,
    requires_human_gate: true,
  },
};

export function normalizeExecutionProfile(
  value: unknown,
): AgentExecutionProfile | null {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const profile = value as AgentExecutionProfile;
  return profile in EXECUTION_PROFILE_CAPABILITIES ? profile : null;
}

export function buildExecutionCapabilities(
  profile?: AgentExecutionProfile | null,
  overrides?: Partial<AgentExecutionCapabilities>,
): AgentExecutionCapabilities {
  const baseProfile =
    profile && profile in EXECUTION_PROFILE_CAPABILITIES
      ? profile
      : DEFAULT_EXECUTION_PROFILE;

  const baseCapabilities = { ...EXECUTION_PROFILE_CAPABILITIES[baseProfile] };

  if (!overrides) {
    return baseCapabilities;
  }

  return {
    can_converse:
      typeof overrides.can_converse === 'boolean'
        ? overrides.can_converse
        : baseCapabilities.can_converse,
    can_plan:
      typeof overrides.can_plan === 'boolean'
        ? overrides.can_plan
        : baseCapabilities.can_plan,
    can_build:
      typeof overrides.can_build === 'boolean'
        ? overrides.can_build
        : baseCapabilities.can_build,
    requires_human_gate:
      typeof overrides.requires_human_gate === 'boolean'
        ? overrides.requires_human_gate
        : baseCapabilities.requires_human_gate,
  };
}
