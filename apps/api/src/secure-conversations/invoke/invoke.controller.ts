/**
 * Secure Conversations Invoke Controller V2
 *
 * A2A entry point for Secure Conversations. Handles both:
 * - Native internal invoke requests (same contract as Agents/Workflows)
 * - External protocol translation (maps external formats to/from invoke)
 *
 * Secure Conversations-specific metadata (external protocol, partner info) lives
 * in the metadata field, not in the shared context capsule.
 */

import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  A2AInvokeSuccessResponse,
  A2AInvokeErrorResponse,
} from '@orchestrator-ai/transport-types';
import { JsonRpcErrorCode } from '@orchestrator-ai/transport-types';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { validateA2AInvokeRequest } from '../../common/validation/a2a-invoke-validation';
import { SecureConversationsDispatchService } from './secure-conversations-dispatch.service';

@Controller('secure-conversations')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class SecureConversationsInvokeController {
  private readonly logger = new Logger(SecureConversationsInvokeController.name);

  constructor(
    private readonly dispatch: SecureConversationsDispatchService,
  ) {}

  /**
   * POST /invoke — native A2A invoke for internal callers
   */
  @Post('invoke')
  @HttpCode(200)
  async invoke(
    @Body() body: unknown,
    @CurrentUser() user: { id: string },
    @Req() request?: { organizationSlug?: string },
  ): Promise<A2AInvokeSuccessResponse | A2AInvokeErrorResponse> {
    const validation = validateA2AInvokeRequest(
      body,
      user.id,
      request?.organizationSlug,
    );

    if (!validation.valid) {
      return {
        jsonrpc: '2.0',
        id: validation.id,
        error: {
          code: JsonRpcErrorCode.INVALID_PARAMS,
          message: validation.message,
        },
      };
    }
    const { id, params } = validation.request;

    try {
      const output = await this.dispatch.invoke(
        params.context,
        params.data,
        params.metadata,
      );

      return {
        jsonrpc: '2.0',
        id,
        result: { success: true, output, context: params.context },
      };
    } catch {
      this.logger.error('Secure Conversations invoke failed');
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: JsonRpcErrorCode.INTERNAL_ERROR,
          message: 'Secure Conversations invocation failed',
          data: { errorType: 'secure_conversations_invocation_failed', retryable: false },
        },
      };
    }
  }
}
