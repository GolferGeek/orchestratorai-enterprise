/** Shapes the Gatehouse API answers with (apps/api/src/gatehouse and ambient/events). */

export type A2ATargetKind = 'ambient' | 'agent' | 'workflow' | 'a2a';

export type A2ATarget =
  | { kind: 'ambient'; event: string }
  | { kind: 'agent'; agentSlug: string }
  | { kind: 'workflow'; workflowSlug: string; input?: Record<string, unknown>; textField?: string }
  | { kind: 'a2a'; cardUrl: string; send: 'all' | 'text'; auth?: Record<string, unknown> };

export interface A2AConfig {
  target: A2ATarget;
  callers: 'any' | { allow: string[] };
}

export type A2AAgentStatus = 'active' | 'disabled' | 'archived';

export interface A2AAgent {
  slug: string;
  orgSlug: string;
  name: string;
  description: string;
  version: string;
  status: string;
  published: boolean;
  cardUrl: string;
  a2a: A2AConfig;
  updatedAt: string;
}

export interface A2AAgentDraft {
  name: string;
  description: string;
  a2a: A2AConfig;
}

export interface Caller {
  id: string;
  name: string;
  cardUrl: string;
  jwksUrl: string | null;
  keyIds: Array<string | null>;
  status: 'active' | 'suspended';
  rateLimitPerMinute: number;
  registeredBy: string;
  createdAt: string;
  lastSeenAt: string | null;
}

export type TaskState = 'submitted' | 'working' | 'completed' | 'failed' | 'canceled' | 'rejected';

export interface GatehouseTask {
  id: string;
  agentSlug: string;
  orgSlug: string;
  /** The registered caller that owns the task, or null when an agent key does. */
  callerId: string | null;
  /** The agent key's grant that owns the task, or null when a registered caller does. */
  grantRef: string | null;
  contextId: string;
  state: TaskState;
  target: A2ATargetKind;
  runId: string | null;
  eventId: string | null;
  artifact: unknown[] | null;
  statusMessage: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OutboundCall {
  id: string;
  orgSlug: string;
  agentSlug: string;
  kind: 'call' | 'reply';
  remoteCardUrl: string;
  remoteName: string | null;
  callerId: string | null;
  contextId: string | null;
  state: 'sending' | 'answered' | 'failed';
  remoteState: string | null;
  remoteTaskId: string | null;
  error: string | null;
  durationMs: number | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface AmbientEvent {
  id: string;
  org_slug: string;
  name: string;
  source: string;
  payload: Record<string, unknown>;
  dedupe_key: string | null;
  origin: { via: string; callerId: string; contextId: string; taskId: string } | null;
  received_at: string;
}

export interface TriggerExecution {
  id: string;
  trigger_id: string;
  trigger_name: string;
  condition_met: boolean | null;
  action_taken: boolean;
  skip_reason?: string | null;
  a2a_response: Record<string, unknown> | null;
  duration_ms: number | null;
  status: string;
  reply_state?: 'waiting' | 'sending' | 'sent' | 'refused' | 'failed' | null;
  reply_run_id?: string | null;
  reply?: Record<string, unknown> | null;
}

export interface EventDetail {
  event: AmbientEvent;
  executions: TriggerExecution[];
}

export interface StorageWatch {
  id: string;
  org_slug: string;
  bucket: string;
  prefix: string;
  event: string;
  enabled: boolean;
  created_by: string | null;
  created_at: string;
}

export type OrderPolicy = 'none' | 'approve_each' | 'auto_within_limits';

/** An agent key: one outside agent acting for one of the company's customer accounts. Never the key itself. */
export interface AgentKey {
  id: string;
  orgSlug: string;
  agentName: string;
  accountRef: string;
  accountLabel: string;
  kind: 'api_key' | 'oauth';
  tokenPrefix: string;
  orderPolicy: OrderPolicy;
  perOrderLimitCents: number | null;
  monthlyLimitCents: number | null;
  rateLimitPerMinute: number;
  validUntil: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdBy: string;
  createdAt: string;
}

export interface NewAgentKey {
  agentName: string;
  accountRef: string;
  accountLabel: string;
  orderPolicy: OrderPolicy;
  perOrderLimitCents: number | null;
  monthlyLimitCents: number | null;
  validDays: number | null;
}

/** An app asking to connect, as the consent page shows it; or why it cannot be shown. */
export type ConsentRequest =
  | {
      client: { name: string; uri: string | null };
      organizations: Array<{ slug: string; name: string }>;
      orgSlug: string;
      accounts: Array<{ ref: string; label: string }>;
    }
  | { show: string }
  | { redirect: string };

export interface ConsentChoice {
  orgSlug: string;
  accountRef: string;
  agentName: string | null;
  orderPolicy: OrderPolicy;
  perOrderLimitCents: number | null;
  monthlyLimitCents: number | null;
  validDays: number | null;
}
