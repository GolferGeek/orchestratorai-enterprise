import type { AgentDefinition } from '../agent-definition.types';

const AUTH_HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const FORBIDDEN_HEADERS = new Set([
  'connection',
  'content-length',
  'content-type',
  'host',
  'proxy-authorization',
  'transfer-encoding',
  'user-agent',
]);

export function buildOutboundHeaders(
  definition: AgentDefinition,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'OrchestratorAI-Agents/1.0',
  };

  const auth = definition.authConfig;
  if (auth === undefined) {
    return headers;
  }
  if (
    !hasOnlyKeys(auth, ['type', 'token', 'header']) ||
    (auth.type !== 'bearer' && auth.type !== 'apikey') ||
    typeof auth.token !== 'string' ||
    !auth.token.trim() ||
    auth.token.length > 8_192 ||
    /[\r\n]/.test(auth.token)
  ) {
    throw new Error(
      `Agent ${definition.slug} has invalid outbound authentication configuration`,
    );
  }

  const header = auth.header === undefined ? 'Authorization' : auth.header;
  if (
    typeof header !== 'string' ||
    !AUTH_HEADER_NAME.test(header) ||
    FORBIDDEN_HEADERS.has(header.toLowerCase())
  ) {
    throw new Error(
      `Agent ${definition.slug} has an invalid authentication header`,
    );
  }

  headers[header] =
    auth.type === 'bearer' ? `Bearer ${auth.token}` : auth.token;
  return headers;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}
