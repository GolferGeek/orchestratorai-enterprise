import { Injectable, Logger } from '@nestjs/common';
import { JsonRpcRequest } from '@orchestrator-ai/transport-types';
import { SigningService, SecurityEnvelope } from '../security/signing.service';
import { RateLimiterService } from '../security/rate-limiter.service';
import { OriginValidatorService } from '../security/origin-validator.service';

/**
 * A2AValidatorService — Validates inbound A2A requests before routing.
 *
 * Applies the full Bridge security stack:
 * 1. Origin validation — is the requesting agent trusted?
 * 2. Rate limiting — is the agent within request limits?
 * 3. JSON-RPC 2.0 format validation — is the request well-formed?
 * 4. Security envelope validation — is the signature valid, nonce unique?
 */

export interface ValidationOutcome {
  valid: boolean;
  jsonRpcError?: {
    code: number;
    message: string;
  };
}

@Injectable()
export class A2AValidatorService {
  private readonly logger = new Logger(A2AValidatorService.name);

  constructor(
    private readonly signing: SigningService,
    private readonly rateLimiter: RateLimiterService,
    private readonly originValidator: OriginValidatorService,
  ) {}

  /**
   * Validate a full inbound A2A request.
   * Returns valid=true if all checks pass, otherwise returns the JSON-RPC error.
   */
  validateInboundRequest(
    body: unknown,
    agentId: string,
    origin: string,
    envelope?: SecurityEnvelope,
  ): ValidationOutcome {
    // 1. Origin validation
    if (!this.originValidator.isOriginTrusted(origin)) {
      this.logger.warn(`Rejected request from untrusted origin: ${origin}`);
      return {
        valid: false,
        jsonRpcError: {
          code: -32003,
          message: `Origin not trusted: ${origin}`,
        },
      };
    }

    // 2. Rate limiting
    const rateLimitKey = agentId || origin;
    if (!this.rateLimiter.isAllowed(rateLimitKey)) {
      this.logger.warn(`Rate limit exceeded for ${rateLimitKey}`);
      return {
        valid: false,
        jsonRpcError: {
          code: -32029,
          message: 'Rate limit exceeded. Try again later.',
        },
      };
    }

    // 3. JSON-RPC 2.0 format
    const jsonRpcRequest = body as JsonRpcRequest;
    if (
      !jsonRpcRequest ||
      jsonRpcRequest.jsonrpc !== '2.0' ||
      typeof jsonRpcRequest.method !== 'string' ||
      (!jsonRpcRequest.id && jsonRpcRequest.id !== 0)
    ) {
      return {
        valid: false,
        jsonRpcError: {
          code: -32600,
          message: 'Invalid JSON-RPC 2.0 request. Required: jsonrpc="2.0", method, id',
        },
      };
    }

    // 4. Security envelope validation (optional — permissive mode skips it)
    const securityMode = process.env.SECURITY_MODE ?? 'strict';
    if (securityMode === 'strict' && envelope) {
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
    } else if (securityMode === 'strict' && !envelope) {
      return {
        valid: false,
        jsonRpcError: {
          code: -32700,
          message: 'Missing security envelope. X-Security-Envelope header required in strict mode.',
        },
      };
    }

    return { valid: true };
  }
}
