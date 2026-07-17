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
  UseGuards,
} from '@nestjs/common';
import type {
  A2AInvokeRequest,
  A2AInvokeSuccessResponse,
  A2AInvokeErrorResponse,
} from '@orchestrator-ai/transport-types';
import { JsonRpcErrorCode } from '@orchestrator-ai/transport-types';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SecureConversationsDispatchService } from './secure-conversations-dispatch.service';

@Controller('secure-conversations')
@UseGuards(JwtAuthGuard)
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
    @Body() body: A2AInvokeRequest,
  ): Promise<A2AInvokeSuccessResponse | A2AInvokeErrorResponse> {
    const { id, params } = body;

    if (!params?.context || !params?.data) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: JsonRpcErrorCode.INVALID_PARAMS,
          message: 'Missing required params: context and data',
        },
      };
    }

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
    } catch (error) {
      this.logger.error(`Secure Conversations invoke failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: JsonRpcErrorCode.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : 'Internal error',
          data: { errorType: 'secure_conversations_invocation_failed', retryable: false },
        },
      };
    }
  }
}
