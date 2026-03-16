/**
 * Forge Invoke Controller V2
 *
 * Single A2A entry point for all Forge capability invocations.
 * Routes to capability modules via the capability registry.
 *
 * Endpoints:
 *   POST /invoke          — synchronous capability invocation
 *   POST /invoke/stream   — streaming capability invocation (SSE)
 */

import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import type {
  A2AInvokeRequest,
  A2AInvokeSuccessResponse,
  A2AInvokeErrorResponse,
} from '@orchestrator-ai/transport-types';
import { JsonRpcErrorCode } from '@orchestrator-ai/transport-types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CapabilityRegistryService } from './capability-registry.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class ForgeInvokeController {
  private readonly logger = new Logger(ForgeInvokeController.name);

  constructor(
    private readonly registry: CapabilityRegistryService,
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
      const output = await this.registry.invoke(
        params.context,
        params.data,
        params.metadata,
      );

      return {
        jsonrpc: '2.0',
        id,
        result: {
          success: true,
          output,
          context: params.context,
        },
      };
    } catch (error) {
      this.logger.error(`Forge invoke failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: JsonRpcErrorCode.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : 'Internal error',
          data: { errorType: 'capability_invocation_failed', retryable: false },
        },
      };
    }
  }

  @Post('invoke/stream')
  @HttpCode(200)
  async invokeStream(
    @Body() body: A2AInvokeRequest,
    @Res() res: Response,
  ): Promise<void> {
    const { id, params } = body;

    if (!params?.context || !params?.data) {
      res.status(400).json({
        jsonrpc: '2.0',
        id,
        error: {
          code: JsonRpcErrorCode.INVALID_PARAMS,
          message: 'Missing required params: context and data',
        },
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      await this.registry.invokeStream(
        params.context,
        params.data,
        params.metadata,
        id,
        res,
      );
    } catch (error) {
      const errorData = JSON.stringify({
        event: 'error',
        requestId: id,
        context: params.context,
        data: {
          code: 'capability_invocation_failed',
          message: error instanceof Error ? error.message : 'Internal error',
          retryable: false,
        },
        timestamp: new Date().toISOString(),
      });
      res.write(`event: error\ndata: ${errorData}\n\n`);
      res.end();
    }
  }
}
