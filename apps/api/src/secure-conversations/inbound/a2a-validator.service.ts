import { Injectable, Logger } from '@nestjs/common';
import { SigningService, SecurityEnvelope } from '../security/signing.service';

interface JsonRpcRequest {
  jsonrpc: string;
  method: string;
  id?: string | number | null;
  params?: unknown;
}
import { RateLimiterService } from '../security/rate-limiter.service';
import { OriginValidatorService } from '../security/origin-validator.service';
import { SecureConversationsDatabaseService } from '../database/secure-conversations-database.service';
import { ExternalRegistryService } from '../registry/external-registry.service';
import {
  type A2AInvokeRequest,
  JsonRpcErrorCode,
} from '@orchestrator-ai/transport-types';
import { validateA2AInvokeRequest } from '../../common/validation/a2a-invoke-validation';

/**
 * A2AValidatorService — Validates inbound A2A requests before routing.
 *
 * Applies the full Secure Conversations security stack:
 * 1. Origin validation — is the requesting agent trusted?
 * 2. Rate limiting — is the agent within request limits?
 * 3. JSON-RPC 2.0 format validation — is the request well-formed?
 * 4. Security envelope validation — is the signature valid, nonce unique?
 */

export type ValidationOutcome =
  | {
      valid: true;
      organizationSlug: string;
      request: A2AInvokeRequest;
    }
  | {
      valid: false;
      jsonRpcError: {
        code: number;
        message: string;
      };
    };

@Injectable()
export class A2AValidatorService {
  private readonly logger = new Logger(A2AValidatorService.name);

  constructor(
    private readonly signing: SigningService,
    private readonly rateLimiter: RateLimiterService,
    private readonly originValidator: OriginValidatorService,
    private readonly db: SecureConversationsDatabaseService,
    private readonly registry: ExternalRegistryService,
  ) {}

  /**
   * Validate a full inbound A2A request.
   * Returns valid=true if all checks pass, otherwise returns the JSON-RPC error.
   */
  async validateInboundRequest(
    body: unknown,
    agentId: string,
    origin: string,
    envelope?: SecurityEnvelope,
    clientIp?: string,
  ): Promise<ValidationOutcome> {
    // 1. JSON-RPC 2.0 format
    const jsonRpcRequest = body as JsonRpcRequest;
    if (
      !jsonRpcRequest ||
      jsonRpcRequest.jsonrpc !== '2.0' ||
      jsonRpcRequest.method !== 'invoke' ||
      (!jsonRpcRequest.id && jsonRpcRequest.id !== 0)
    ) {
      return {
        valid: false,
        jsonRpcError: {
          code: -32600,
          message:
            'Invalid JSON-RPC 2.0 request. Required: jsonrpc="2.0", method="invoke", id',
        },
      };
    }

    // 2. Rate limit the network caller before any trust work. Agent-provided
    // headers are not used as the pre-authentication key.
    const networkKey = clientIp?.trim() || origin?.trim();
    if (!networkKey || !this.rateLimiter.isAllowed(`network:${networkKey}`)) {
      this.logger.warn(`Rate limit exceeded for ${networkKey || 'unknown caller'}`);
      return {
        valid: false,
        jsonRpcError: {
          code: -32029,
          message: 'Rate limit exceeded. Try again later.',
        },
      };
    }

    // 3. Origin validation
    if (!this.originValidator.isOriginTrusted(origin)) {
      this.logger.warn(`Rejected request from untrusted origin: ${origin}`);
      return {
        valid: false,
        jsonRpcError: {
          code: -32003,
          message: 'Origin is not trusted',
        },
      };
    }

    // 4. Security envelope validation (optional — permissive mode skips it)
    const securityMode = process.env.SECURITY_MODE ?? 'strict';
    if (securityMode === 'strict' && envelope) {
      if (
        !agentId?.trim() ||
        agentId.length > 128 ||
        envelope.senderId !== agentId
      ) {
        return {
          valid: false,
          jsonRpcError: {
            code: -32002,
            message: 'Agent identity does not match signed envelope',
          },
        };
      }

      const result = this.signing.validateEnvelope(envelope, body);
      if (!result.valid) {
        return {
          valid: false,
          jsonRpcError: {
            code: result.rejectionCode ?? -32002,
            message: result.rejectionReason ?? 'Security validation failed',
          },
        };
      }

      try {
        const claimed = await this.db.claimInboundNonce(
          envelope.nonce,
          envelope.senderId,
          new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        );
        if (!claimed) {
          return {
            valid: false,
            jsonRpcError: {
              code: -32001,
              message: 'Replay detected: nonce already seen',
            },
          };
        }
      } catch (error) {
        this.logger.error(
          `Distributed replay protection unavailable: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return {
          valid: false,
          jsonRpcError: {
            code: -32050,
            message: 'Security verification is unavailable',
          },
        };
      }
    } else if (securityMode === 'strict' && !envelope) {
      return {
        valid: false,
        jsonRpcError: {
          code: -32700,
          message: 'Missing security envelope. X-Security-Envelope header required in strict mode.',
        },
      };
    }

    const authenticatedAgentId = envelope?.senderId || agentId;
    if (
      typeof authenticatedAgentId !== 'string' ||
      !authenticatedAgentId.trim() ||
      authenticatedAgentId.length > 128
    ) {
      return {
        valid: false,
        jsonRpcError: {
          code: -32002,
          message: 'Authenticated external agent identity is required',
        },
      };
    }
    if (!this.rateLimiter.isAllowed(`agent:${authenticatedAgentId}`)) {
      return {
        valid: false,
        jsonRpcError: {
          code: -32029,
          message: 'Rate limit exceeded. Try again later.',
        },
      };
    }

    try {
      const identity = await this.registry.resolveAuthenticatedAgent(
        authenticatedAgentId,
        origin,
      );
      const transport = validateA2AInvokeRequest(
        body,
        `external:${authenticatedAgentId}`,
        identity.organizationSlug,
      );
      if (!transport.valid) {
        return {
          valid: false,
          jsonRpcError: {
            code: JsonRpcErrorCode.INVALID_PARAMS,
            message: transport.message,
          },
        };
      }
      return {
        valid: true,
        organizationSlug: identity.organizationSlug,
        request: transport.request,
      };
    } catch (error) {
      this.logger.warn(
        `Rejected unregistered external identity: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        valid: false,
        jsonRpcError: {
          code: -32003,
          message: 'External agent identity is not registered',
        },
      };
    }
  }
}
