import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { InProcessJwtAuthGuard as JwtAuthGuard, InProcessRbacGuard as RbacGuard, RequirePermission } from '@orchestratorai/auth-client';
import { CadAgentService } from './cad-agent.service';
import { CadAgentRequestDto } from './dto';
import { CadDbService } from './services/cad-db.service';

/**
 * CadAgentController
 *
 * REST API endpoints for the CAD Agent:
 * - POST /agents/engineering/cad-agent/generate - Start a new CAD generation
 * - GET /agents/engineering/cad-agent/status/:taskId - Check generation status
 * - GET /agents/engineering/cad-agent/history/:taskId - Get full state history
 * - GET /agents/engineering/cad-agent/outputs/:drawingId - Get output files for a drawing
 */
@Controller('agents/engineering/cad-agent')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class CadAgentController {
  private readonly logger = new Logger(CadAgentController.name);

  constructor(
    private readonly cadAgentService: CadAgentService,
    private readonly cadDbService: CadDbService,
  ) {}

  /**
   * Start a new CAD generation
   */
  @Post('generate')
  @HttpCode(HttpStatus.OK)
  async generate(@Body() request: CadAgentRequestDto) {
    // ExecutionContext is required - no fallbacks
    if (!request.context) {
      throw new BadRequestException('ExecutionContext is required');
    }

    const context = request.context;
    this.logger.log(
      `Received CAD generation request: conversationId=${context.conversationId}, userId=${context.userId}`,
    );

    try {
      const result = await this.cadAgentService.generate({
        context,
        userMessage: request.userMessage,
        projectId: request.projectId,
        newProjectName: request.newProjectName,
        constraints: request.constraints,
      });

      return {
        success: result.status === 'completed',
        data: result,
      };
    } catch (error) {
      this.logger.error('CAD generation failed:', error);
      throw new BadRequestException(
        error instanceof Error ? error.message : 'CAD generation failed',
      );
    }
  }

  /**
   * Get CAD generation status by task ID
   */
  @Get('status/:taskId')
  @HttpCode(HttpStatus.OK)
  async getStatus(@Param('taskId') taskId: string) {
    this.logger.log(`Getting status for task: ${taskId}`);

    const status = await this.cadAgentService.getStatus(taskId);

    if (!status) {
      throw new NotFoundException(`CAD generation not found: ${taskId}`);
    }

    return {
      success: true,
      data: status,
    };
  }

  /**
   * Get full state history for a task
   */
  @Get('history/:taskId')
  @HttpCode(HttpStatus.OK)
  async getHistory(@Param('taskId') taskId: string) {
    this.logger.log(`Getting history for task: ${taskId}`);

    const history = await this.cadAgentService.getHistory(taskId);

    if (history.length === 0) {
      throw new NotFoundException(`CAD generation not found: ${taskId}`);
    }

    return {
      success: true,
      data: history,
      count: history.length,
    };
  }

  /**
   * Get output files for a drawing by drawing ID
   */
  @Get('outputs/:drawingId')
  @HttpCode(HttpStatus.OK)
  async getOutputs(@Param('drawingId') drawingId: string) {
    this.logger.log(`Getting outputs for drawing: ${drawingId}`);

    try {
      // Get outputs from database
      const outputs = await this.cadDbService.getDrawingOutputs(drawingId);

      if (outputs.length === 0) {
        throw new NotFoundException(
          `No outputs found for drawing: ${drawingId}`,
        );
      }

      // Convert database outputs to CadOutputs format
      const result: {
        step?: string;
        stl?: string;
        gltf?: string;
        dxf?: string;
        thumbnail?: string;
      } = {};
      let meshStats;

      for (const output of outputs) {
        const url = output.storage_path;
        if (!url) continue;

        switch (output.format) {
          case 'step':
            result.step = url;
            break;
          case 'stl':
            result.stl = url;
            break;
          case 'gltf':
            result.gltf = url;
            // Extract mesh stats if available
            if (output.mesh_stats && typeof output.mesh_stats === 'object') {
              const stats = output.mesh_stats;
              if (stats.vertices !== undefined && stats.faces !== undefined) {
                meshStats = {
                  vertices: stats.vertices,
                  faces: stats.faces,
                  boundingBox: stats.boundingBox,
                };
              }
            }
            break;
          case 'dxf':
            result.dxf = url;
            break;
          case 'thumbnail':
            result.thumbnail = url;
            break;
        }
      }

      return {
        success: true,
        data: {
          outputs: result,
          meshStats,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to get outputs for drawing ${drawingId}:`,
        error,
      );
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to get drawing outputs',
      );
    }
  }
}
