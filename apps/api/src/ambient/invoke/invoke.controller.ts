/**
 * Ambient Invoke Controller V2
 *
 * Thin A2A entry point for Ambient. Ambient is internally focused —
 * most invocations come from triggers, not external callers.
 * This controller handles the thin-edge A2A surface.
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
import { AmbientDispatchService } from './ambient-dispatch.service';

@Controller('ambient')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class AmbientInvokeController {
  private readonly logger = new Logger(AmbientInvokeController.name);

  constructor(
    private readonly dispatch: AmbientDispatchService,
  ) {}

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
      this.logger.error('Ambient invoke failed');
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: JsonRpcErrorCode.INTERNAL_ERROR,
          message: 'Ambient invocation failed',
          data: { errorType: 'ambient_invocation_failed', retryable: false },
        },
      };
    }
  }
}
