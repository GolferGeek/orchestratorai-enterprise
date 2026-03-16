import { Controller, Get, Post, Body } from '@nestjs/common';
import { WorkflowService } from './workflow.service';

@Controller('api/workflow')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post('execute')
  execute(@Body() body: { topic: string }) {
    return this.workflowService.executeContentPipeline(body.topic);
  }

  @Get('history')
  getHistory() {
    return this.workflowService.getHistory();
  }
}
