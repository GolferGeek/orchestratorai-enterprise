import type { ConfigProvider } from '@orchestratorai/planes/config';
import type { OutboundAuth } from '../agent-definition.types';

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

/**
 * Headers for an outbound call. The token is read from the config provider
 * under `auth.secret` at call time; the agent row only names it.
 */
export function buildOutboundHeaders(
  owner: string,
  auth: OutboundAuth | undefined,
  config: ConfigProvider,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'OrchestratorAI-Agents/1.0',
  };
  if (auth === undefined) {
    return headers;
  }

  const token = config.getRequired(auth.secret);
  if (!token.trim() || token.length > 8_192 || /[\r\n]/.test(token)) {
    throw new Error(`${owner}: the secret ${auth.secret} is not a usable token`);
  }

  const header = auth.header ?? 'Authorization';
  if (!AUTH_HEADER_NAME.test(header) || FORBIDDEN_HEADERS.has(header.toLowerCase())) {
    throw new Error(`${owner} has an invalid authentication header`);
  }

  headers[header] = auth.type === 'bearer' ? `Bearer ${token}` : token;
  return headers;
}
