/**
 * Pulse Invoke Controller V2
 *
 * Thin A2A entry point for Pulse. Pulse is internally focused —
 * most invocations come from triggers, not external callers.
 * This controller handles the thin-edge A2A surface.
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { PulseDispatchService } from './pulse-dispatch.service';

@Controller()
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class PulseInvokeController {
  private readonly logger = new Logger(PulseInvokeController.name);

  constructor(
    private readonly dispatch: PulseDispatchService,
  ) {}

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
      this.logger.error(`Pulse invoke failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: JsonRpcErrorCode.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : 'Internal error',
          data: { errorType: 'pulse_invocation_failed', retryable: false },
        },
      };
    }
  }
}
