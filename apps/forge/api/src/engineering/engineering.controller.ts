import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpException,
  Res,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Response } from 'express';
import { InProcessJwtAuthGuard as JwtAuthGuard, InProcessRbacGuard as RbacGuard, RequirePermission } from '@orchestratorai/auth-client';
import { EngineeringService } from './engineering.service';
import {
  CreateProjectDto,
  UpdateProjectDto,
  DrawingResponseDto,
  DrawingOutputDto,
  ExecutionLogEntryDto,
} from './dto';

@ApiTags('Engineering')
@Controller('engineering')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
@ApiBearerAuth()
export class EngineeringController {
  private readonly logger = new Logger(EngineeringController.name);

  constructor(private readonly engineeringService: EngineeringService) {}

  // =============================================================================
  // PROJECTS
  // =============================================================================

  @Post('projects')
  @ApiOperation({ summary: 'Create a new engineering project' })
  @ApiResponse({
    status: 201,
    description: 'Project created successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async createProject(@Body() dto: CreateProjectDto) {
    return this.engineeringService.createProject({
      org_slug: dto.orgSlug,
      name: dto.name,
      description: dto.description,
      constraints: dto.constraints,
      metadata: dto.metadata,
      created_by: dto.created_by,
    });
  }

  @Get('projects')
  @ApiOperation({ summary: 'List projects for an organization' })
  @ApiQuery({ name: 'org', description: 'Organization slug', required: true })
  @ApiResponse({
    status: 200,
    description: 'List of projects',
  })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async listProjects(@Query('org') orgSlug: string) {
    if (!orgSlug) {
      throw new HttpException(
        'Organization slug is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.engineeringService.listProjects(orgSlug);
  }

  @Get('projects/:id')
  @ApiOperation({ summary: 'Get a single project by ID' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiResponse({
    status: 200,
    description: 'Project details',
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async getProject(@Param('id') id: string) {
    const project = await this.engineeringService.getProject(id);
    if (!project) {
      throw new HttpException('Project not found', HttpStatus.NOT_FOUND);
    }
    return project;
  }

  @Put('projects/:id')
  @ApiOperation({ summary: 'Update a project' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiResponse({
    status: 200,
    description: 'Project updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async updateProject(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.engineeringService.updateProject(id, {
      name: dto.name,
      description: dto.description,
      constraints: dto.constraints,
      metadata: dto.metadata,
    });
  }

  // =============================================================================
  // DRAWINGS
  // =============================================================================

  @Get('drawings/:id')
  @ApiOperation({ summary: 'Get a drawing with all related data' })
  @ApiParam({ name: 'id', description: 'Drawing ID' })
  @ApiResponse({
    status: 200,
    description: 'Drawing with outputs, code, and execution log',
    type: DrawingResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Drawing not found' })
  async getDrawing(@Param('id') id: string): Promise<DrawingResponseDto> {
    const result = await this.engineeringService.getDrawingWithDetails(id);
    if (!result) {
      throw new HttpException('Drawing not found', HttpStatus.NOT_FOUND);
    }

    const { drawing, outputs, generatedCode, executionLog } = result;

    return {
      ...drawing,
      outputs: outputs as DrawingOutputDto[],
      generated_code: generatedCode,
      execution_log: executionLog as ExecutionLogEntryDto[],
    };
  }

  @Get('drawings/:id/outputs')
  @ApiOperation({ summary: 'Get CAD output files for a drawing' })
  @ApiParam({ name: 'id', description: 'Drawing ID' })
  @ApiResponse({
    status: 200,
    description: 'List of CAD output files',
    type: [DrawingOutputDto],
  })
  @ApiResponse({ status: 404, description: 'Drawing not found' })
  async getDrawingOutputs(
    @Param('id') id: string,
  ): Promise<DrawingOutputDto[]> {
    // Verify drawing exists
    const drawing = await this.engineeringService.getDrawing(id);
    if (!drawing) {
      throw new HttpException('Drawing not found', HttpStatus.NOT_FOUND);
    }

    const outputs = await this.engineeringService.getDrawingOutputs(id);
    return outputs as DrawingOutputDto[];
  }

  @Get('drawings/:id/stream')
  @ApiOperation({ summary: 'Stream real-time progress updates for a drawing' })
  @ApiParam({ name: 'id', description: 'Drawing ID' })
  @ApiResponse({
    status: 200,
    description: 'Server-Sent Events stream of execution log entries',
  })
  @ApiResponse({ status: 404, description: 'Drawing not found' })
  async streamDrawingProgress(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    // Verify drawing exists
    const drawing = await this.engineeringService.getDrawing(id);
    if (!drawing) {
      throw new HttpException('Drawing not found', HttpStatus.NOT_FOUND);
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial connection event
    res.write(
      `data: ${JSON.stringify({ type: 'connected', drawingId: id })}\n\n`,
    );

    // Send existing log entries
    const existingLog = await this.engineeringService.getExecutionLog(id);
    for (const entry of existingLog) {
      res.write(`data: ${JSON.stringify({ type: 'log', entry })}\n\n`);
    }

    // The drawing's conversation_id is used to filter observability events emitted
    // by the CAD agent workflow running for this drawing.
    if (!drawing.conversation_id) {
      this.logger.warn(
        `Drawing ${id} has no conversation_id — cannot stream live progress`,
      );
      res.write(
        `data: ${JSON.stringify({ type: 'complete', reason: 'no_conversation_id' })}\n\n`,
      );
      res.end();
      return;
    }

    const stream$ = this.engineeringService.getExecutionLogStream(
      drawing.conversation_id,
    );

    const subscription = stream$.subscribe({
      next: (event) => {
        res.write(`data: ${JSON.stringify({ type: 'log', event })}\n\n`);

        // Close stream when the workflow signals completion or failure
        const step = event.step ?? '';
        if (step === 'export_completed' || event.status === 'error') {
          res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
          res.end();
        }
      },
      error: (err: unknown) => {
        this.logger.error(
          `Drawing stream error for ${id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      },
    });

    // Handle client disconnect
    res.on('close', () => {
      this.logger.log(`Client disconnected from drawing stream: ${id}`);
      subscription.unsubscribe();
      res.end();
    });
  }
}
