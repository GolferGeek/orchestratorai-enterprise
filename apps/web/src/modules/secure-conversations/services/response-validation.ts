import type { A2AMessage, ExternalAgent, MessageStats } from '../types';

const AGENT_STATUSES = new Set(['online', 'offline', 'unknown']);
const TRUST_LEVELS = new Set([
  'trusted',
  'neutral',
  'untrusted',
  'unknown',
]);
const DIRECTIONS = new Set(['inbound', 'outbound']);
const MESSAGE_STATUSES = new Set([
  'pending',
  'success',
  'error',
  'rejected',
  'rate_limited',
]);

export function parseExternalAgents(value: unknown): ExternalAgent[] {
  if (!Array.isArray(value)) {
    throw new Error('Secure Conversations registry response was malformed');
  }
  return value.map(parseExternalAgent);
}

export function parseExternalAgent(value: unknown): ExternalAgent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Secure Conversations registry response was malformed');
  }
  const row = value as Record<string, unknown>;
  if (
    !isNonEmptyString(row.id) ||
    !isNonEmptyString(row.name) ||
    typeof row.description !== 'string' ||
    !isHttpUrl(row.url) ||
    !isNonEmptyString(row.version) ||
    !Array.isArray(row.capabilities) ||
    !row.capabilities.every(isNonEmptyString) ||
    typeof row.status !== 'string' ||
    !AGENT_STATUSES.has(row.status) ||
    !isIsoDate(row.lastSeen) ||
    !isIntegerInRange(row.trustScore, 0, 100) ||
    typeof row.trustLevel !== 'string' ||
    !TRUST_LEVELS.has(row.trustLevel) ||
    !isIntegerInRange(row.interactions, 0, Number.MAX_SAFE_INTEGER) ||
    !isIsoDate(row.registeredAt)
  ) {
    throw new Error('Secure Conversations registry response was malformed');
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    url: row.url,
    version: row.version,
    capabilities: row.capabilities,
    status: row.status as ExternalAgent['status'],
    lastSeen: row.lastSeen,
    trustScore: row.trustScore,
    trustLevel: row.trustLevel as ExternalAgent['trustLevel'],
    interactions: row.interactions,
    registeredAt: row.registeredAt,
  };
}

export function parseA2AMessages(value: unknown): A2AMessage[] {
  if (!Array.isArray(value)) {
    throw new Error('Secure Conversations message response was malformed');
  }
  return value.map(parseA2AMessage);
}

export function parseA2AMessage(value: unknown): A2AMessage {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Secure Conversations message response was malformed');
  }
  const row = value as Record<string, unknown>;
  if (
    !isNonEmptyString(row.id) ||
    !isNonEmptyString(row.org_slug) ||
    typeof row.direction !== 'string' ||
    !DIRECTIONS.has(row.direction) ||
    !isNullableString(row.external_agent_id) ||
    !isNullableString(row.method) ||
    !isNullableString(row.request_id) ||
    !Object.prototype.hasOwnProperty.call(row, 'request_payload') ||
    !Object.prototype.hasOwnProperty.call(row, 'response_payload') ||
    typeof row.status !== 'string' ||
    !MESSAGE_STATUSES.has(row.status) ||
    !isNullableString(row.rejection_reason) ||
    !isNullableNonNegativeInteger(row.duration_ms) ||
    !isIsoDate(row.created_at)
  ) {
    throw new Error('Secure Conversations message response was malformed');
  }
  return {
    id: row.id,
    org_slug: row.org_slug,
    direction: row.direction as A2AMessage['direction'],
    external_agent_id: row.external_agent_id as string | null,
    method: row.method as string | null,
    request_id: row.request_id as string | null,
    request_payload: row.request_payload,
    response_payload: row.response_payload,
    status: row.status as A2AMessage['status'],
    rejection_reason: row.rejection_reason as string | null,
    duration_ms: row.duration_ms as number | null,
    created_at: row.created_at,
  };
}

export function parseMessageStats(value: unknown): MessageStats {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Secure Conversations message statistics were malformed');
  }
  const stats = value as Record<string, unknown>;
  const keys: Array<keyof MessageStats> = [
    'total',
    'inbound',
    'outbound',
    'success',
    'error',
    'rejected',
  ];
  if (
    !keys.every((key) =>
      isIntegerInRange(stats[key], 0, Number.MAX_SAFE_INTEGER),
    ) ||
    stats.total !== (stats.inbound as number) + (stats.outbound as number) ||
    (stats.success as number) +
      (stats.error as number) +
      (stats.rejected as number) >
      (stats.total as number)
  ) {
    throw new Error('Secure Conversations message statistics were malformed');
  }
  return {
    total: stats.total as number,
    inbound: stats.inbound as number,
    outbound: stats.outbound as number,
    success: stats.success as number,
    error: stats.error as number,
    rejected: stats.rejected as number,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= maximum
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || isIntegerInRange(value, 0, Number.MAX_SAFE_INTEGER);
}
