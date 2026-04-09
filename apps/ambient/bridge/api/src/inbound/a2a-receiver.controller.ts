import {
  Controller,
  Post,
  Body,
  Headers,
  Logger,
  HttpCode,
} from '@nestjs/common';
import { Public } from '@orchestratorai/auth-client';
import { A2AValidatorService } from './a2a-validator.service';
import { A2ARouterService } from './a2a-router.service';
import { SecurityEnvelope } from '../security/signing.service';
import { BridgeDatabaseService } from '../database/bridge-database.service';

/**
 * A2AReceiverController — Inbound A2A endpoint.
 *
 * Receives external A2A requests in JSON-RPC 2.0 format.
 * Applies the Bridge security stack (validate → route → forward).
 *
 * External agents send:
 *   POST /a2a/tasks
 *   {
 *     "jsonrpc": "2.0",
 *     "id": "request-id",
 *     "method": "compose.converse",
 *     "params": {
 *       "mode": "converse",
 *       "userMessage": "...",
 *       "context": { ... }
 *     }
 *   }
 *
 * Security headers:
 *   X-Agent-Id: the external agent's ID
 *   X-Security-Envelope: JSON-encoded SecurityEnvelope (required in strict mode)
 *
 * Message lifecycle:
 *   1. Log inbound message as 'pending' immediately on receipt
 *   2a. Validation failure → update status to 'rejected' with reason
 *   2b. Routing success   → update status to 'success' with response and duration
 *   2c. Routing error     → update status to 'error'
 */
// A2A inbound receiver — external agents send messages here. TODO: add request signing verification.
@Public()
@Controller('a2a')
export class A2AReceiverController {
  private readonly logger = new Logger(A2AReceiverController.name);

  private readonly defaultOrgSlug = process.env.DEFAULT_ORG_SLUG ?? 'default';

  constructor(
    private readonly validator: A2AValidatorService,
    private readonly router: A2ARouterService,
    private readonly db: BridgeDatabaseService,
  ) {}

  @Post('tasks')
  @HttpCode(200)
  async receiveTask(
    @Body() body: unknown,
    @Headers('x-agent-id') agentId: string,
    @Headers('origin') origin: string,
    @Headers('x-security-envelope') rawEnvelope: string,
    @Headers('host') host: string,
  ): Promise<unknown> {
    const requestOrigin = origin ?? `http://${host}`;
    const requestId = (body as { id?: string | number })?.id ?? 'unknown';
    const method = (body as { method?: string })?.method ?? null;
    const startMs = Date.now();

    this.logger.log(`Inbound A2A request from ${agentId ?? 'unknown'} at ${requestOrigin}`);

    // Log the inbound message as pending — we always record it regardless of outcome
    let messageLogId: string | null = null;
    try {
      messageLogId = await this.db.logMessage({
        org_slug: this.defaultOrgSlug,
        direction: 'inbound',
        external_agent_id: agentId ?? null,
        method: method,
        request_id: String(requestId),
        request_payload: body as unknown,
        status: 'pending',
      });
    } catch (logError) {
      // Logging failure must not block request processing — but surface the error
      this.logger.error(
        `Failed to log inbound message: ${logError instanceof Error ? logError.message : String(logError)}`,
      );
    }

    // Parse security envelope if provided
    let envelope: SecurityEnvelope | undefined;
    if (rawEnvelope) {
      try {
        envelope = JSON.parse(rawEnvelope) as SecurityEnvelope;
      } catch {
        const errorResponse = {
          jsonrpc: '2.0',
          id: requestId,
          error: {
            code: -32700,
            message: 'Failed to parse X-Security-Envelope header: invalid JSON',
          },
        };

        if (messageLogId) {
          await this.db.updateMessageStatus(
            messageLogId,
            'rejected',
            errorResponse,
            Date.now() - startMs,
          );
        }

        return errorResponse;
      }
    }

    // Validate the inbound request
    const validation = this.validator.validateInboundRequest(
      body,
      agentId,
      requestOrigin,
      envelope,
    );

    if (!validation.valid) {
      const rejectionReason = validation.jsonRpcError?.message ?? 'Validation failed';
      this.logger.warn(`Rejected inbound request ${requestId}: ${rejectionReason}`);

      const errorResponse = {
        jsonrpc: '2.0',
        id: requestId,
        error: validation.jsonRpcError,
      };

      if (messageLogId) {
        try {
          await this.db.updateMessageStatus(
            messageLogId,
            'rejected',
            errorResponse,
            Date.now() - startMs,
          );
        } catch (updateError) {
          this.logger.error(
            `Failed to update rejected message status: ${updateError instanceof Error ? updateError.message : String(updateError)}`,
          );
        }
      }

      return errorResponse;
    }

    // Route and forward to internal agent
    const request = body as { method: string; params?: Record<string, unknown> };
    const target = this.router.resolveRoute(request.method, request.params, agentId);

    try {
      const response = await this.router.forwardRequest(target, body, agentId);
      const durationMs = Date.now() - startMs;

      this.logger.log(`Forwarded ${request.method} to ${target.product}, got response`);

      if (messageLogId) {
        try {
          await this.db.updateMessageStatus(messageLogId, 'success', response, durationMs);
        } catch (updateError) {
          this.logger.error(
            `Failed to update success message status: ${updateError instanceof Error ? updateError.message : String(updateError)}`,
          );
        }
      }

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal routing error';
      const durationMs = Date.now() - startMs;

      this.logger.error(`Failed to forward to ${target.product}: ${message}`);

      const errorResponse = {
        jsonrpc: '2.0',
        id: requestId,
        error: {
          code: -32000,
          message: `Bridge routing error: ${message}`,
        },
      };

      if (messageLogId) {
        try {
          await this.db.updateMessageStatus(messageLogId, 'error', errorResponse, durationMs);
        } catch (updateError) {
          this.logger.error(
            `Failed to update error message status: ${updateError instanceof Error ? updateError.message : String(updateError)}`,
          );
        }
      }

      return errorResponse;
    }
  }
}
