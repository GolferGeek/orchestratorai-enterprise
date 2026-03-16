/**
 * Invoke Controller V2
 *
 * Single entry point for all Compose agent invocations.
 * Replaces the mode-heavy agent2agent controller with a lean
 * invoke { context, data, metadata? } contract.
 *
 * Endpoints:
 *   POST /invoke          — synchronous invocation
 *   POST /invoke/stream   — streaming invocation (SSE)
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
import { InvokeDispatchService } from './invoke-dispatch.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class InvokeController {
  private readonly logger = new Logger(InvokeController.name);

  constructor(private readonly dispatch: InvokeDispatchService) {}

  /**
   * POST /invoke — synchronous agent invocation
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
        result: {
          success: true,
          output,
          context: params.context,
        },
      };
    } catch (error) {
      this.logger.error(
        `Invoke failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: JsonRpcErrorCode.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : 'Internal error',
          data: {
            errorType: 'invocation_failed',
            retryable: false,
          },
        },
      };
    }
  }

  /**
   * POST /invoke/stream — streaming agent invocation (SSE)
   */
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

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      await this.dispatch.invokeStream(
        params.context,
        params.data,
        params.metadata,
        id,
        res,
      );
    } catch (error) {
      // Send error event
      const errorData = JSON.stringify({
        event: 'error',
        requestId: id,
        context: params.context,
        data: {
          code: 'invocation_failed',
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
