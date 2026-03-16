/**
 * Bridge Invoke Controller V2
 *
 * A2A entry point for Bridge. Handles both:
 * - Native internal invoke requests (same contract as Compose/Forge)
 * - External protocol translation (maps external formats to/from invoke)
 *
 * Bridge-specific metadata (external protocol, partner info) lives
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
import { BridgeDispatchService } from './bridge-dispatch.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class BridgeInvokeController {
  private readonly logger = new Logger(BridgeInvokeController.name);

  constructor(
    private readonly dispatch: BridgeDispatchService,
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
      this.logger.error(`Bridge invoke failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: JsonRpcErrorCode.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : 'Internal error',
          data: { errorType: 'bridge_invocation_failed', retryable: false },
        },
      };
    }
  }
}
