/**
 * SecurityValidationGuard
 *
 * A NestJS guard that validates the `security` envelope on incoming requests.
 * Apply this guard to any agent controller that receives signed inter-agent
 * messages.
 *
 * Expected request body shape:
 * {
 *   security: SecurityEnvelopeData,  // required
 *   ...payload fields
 * }
 *
 * On validation failure the guard throws an HttpException with a JSON-RPC 2.0
 * error response body, using the appropriate error code:
 *   -32700  Parse error (missing envelope fields)
 *   -32600  Invalid request (expired timestamp, malformed schema)
 *   -32001  Replay detected
 *   -32002  Signature verification failed
 *
 * When no `security` field is present in the body, the guard rejects with -32700.
 */

import { CanActivate, ExecutionContext, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { SecurityService, SecurityEnvelopeData } from './security.service';

/** Module-level singleton so nonce state is shared across all guarded routes. */
const securityService = new SecurityService();

function jsonRpcErrorBody(code: number, message: string): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id: null,
    error: { code, message },
  };
}

@Injectable()
export class SecurityValidationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ body: Record<string, unknown> }>();
    const body = request.body;

    if (!body || typeof body !== 'object') {
      throw new HttpException(
        jsonRpcErrorBody(-32700, 'Malformed security envelope: request body is missing'),
        HttpStatus.BAD_REQUEST,
      );
    }

    const envelope = body['security'] as SecurityEnvelopeData | undefined;

    if (!envelope) {
      throw new HttpException(
        jsonRpcErrorBody(-32700, 'Malformed security envelope: missing required fields'),
        HttpStatus.BAD_REQUEST,
      );
    }

    // Build the payload to validate against (everything except the security envelope itself).
    const { security: _security, ...payload } = body;

    const result = securityService.validateEnvelope(envelope, payload);

    if (!result.valid) {
      const code = result.rejectionCode ?? -32600;
      const reason = result.rejectionReason ?? 'Security validation failed';

      const httpStatus =
        code === -32001 || code === -32002
          ? HttpStatus.UNAUTHORIZED
          : HttpStatus.BAD_REQUEST;

      throw new HttpException(jsonRpcErrorBody(code, reason), httpStatus);
    }

    return true;
  }
}
