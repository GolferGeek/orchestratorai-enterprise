import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Patch,
  NotFoundException,
  HttpCode,
} from '@nestjs/common';
import { WorkflowRegistryService, WorkflowDefinition } from './workflow-registry.service';
import { WorkflowExecutorService } from './workflow-executor.service';

@Controller('workflows')
export class WorkflowsController {
  constructor(
    private readonly registry: WorkflowRegistryService,
    private readonly executor: WorkflowExecutorService,
  ) {}

  @Get()
  getAll() {
    return this.registry.getAll();
  }

  @Get('runs')
  getAllRuns() {
    return this.registry.getRuns();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    const wf = this.registry.getById(id);
    if (!wf) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }
    return wf;
  }

  @Get(':id/runs')
  getRuns(@Param('id') id: string) {
    return this.registry.getRuns(id);
  }

  @Post()
  register(@Body() definition: WorkflowDefinition) {
    this.registry.register(definition);
    return definition;
  }

  @Post(':id/execute')
  @HttpCode(202)
  async execute(
    @Param('id') id: string,
    @Body() body: { triggerData?: Record<string, unknown> },
  ) {
    const run = await this.executor.execute(id, body.triggerData);
    return run;
  }

  @Patch(':id/enable')
  enable(@Param('id') id: string) {
    const wf = this.registry.getById(id);
    if (!wf) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }
    this.registry.enable(id);
    return { id, enabled: true };
  }

  @Patch(':id/disable')
  disable(@Param('id') id: string) {
    const wf = this.registry.getById(id);
    if (!wf) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }
    this.registry.disable(id);
    return { id, enabled: false };
  }
}
