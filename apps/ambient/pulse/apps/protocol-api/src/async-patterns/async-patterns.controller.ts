import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import {
  AsyncPatternsService,
  FireAndForgetResult,
  RequestResponseResult,
  CallbackTaskResult,
  PollingTaskResult,
  TaskStatusResult,
} from './async-patterns.service';

@Controller('api/async-patterns')
export class AsyncPatternsController {
  constructor(private readonly asyncPatternsService: AsyncPatternsService) {}

  @Post('fire-and-forget')
  @HttpCode(202)
  async fireAndForget(): Promise<FireAndForgetResult> {
    return this.asyncPatternsService.fireAndForget();
  }

  @Post('request-response')
  async requestResponse(): Promise<RequestResponseResult> {
    return this.asyncPatternsService.requestResponse();
  }

  @Post('callback')
  @HttpCode(202)
  async submitCallback(@Body() body: { callbackId?: string }): Promise<CallbackTaskResult> {
    const callbackId = body.callbackId ?? `cb-${Date.now()}`;
    return this.asyncPatternsService.submitCallbackTask(callbackId);
  }

  @Get('callback/:taskId')
  getCallbackResult(@Param('taskId') taskId: string): TaskStatusResult {
    return this.asyncPatternsService.getCallbackResult(taskId);
  }

  @Post('polling')
  @HttpCode(202)
  async submitPolling(): Promise<PollingTaskResult> {
    return this.asyncPatternsService.submitPollingTask();
  }

  @Get('polling/:taskId')
  getPollingStatus(@Param('taskId') taskId: string): TaskStatusResult {
    return this.asyncPatternsService.getPollingStatus(taskId);
  }

  @Get('streaming')
  async streaming(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    try {
      for await (const event of this.asyncPatternsService.streamResearch()) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Streaming error';
      res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
    } finally {
      res.end();
    }
  }
}
