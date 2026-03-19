import { ProtocolMessage } from '@agent-communication/shared-types';
import { getAuthHeadersAsync } from '../auth/agent-token.service';

const PROTOCOL_API_URL = process.env.PROTOCOL_API_URL || 'http://localhost:6402';

/**
 * Fire-and-forget post of a ProtocolMessage to the Protocol API's message store.
 * Used by scenario services to make scenario messages visible in the Observability UI.
 */
export function postMessageToProtocolApi(message: ProtocolMessage): void {
  getAuthHeadersAsync()
    .then(authHeaders => {
      return fetch(`${PROTOCOL_API_URL}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(message),
      });
    })
    .catch(() => {
      // Fire-and-forget — don't fail the scenario if Protocol API is unreachable or auth fails
    });
}
