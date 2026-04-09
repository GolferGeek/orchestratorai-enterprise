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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { ExtendedPostWriterService } from './extended-post-writer.service';
import {
  ExtendedPostWriterRequestDto,
  ExtendedPostWriterResumeDto,
} from './dto';
/**
 * ExtendedPostWriterController
 *
 * REST API endpoints for the Extended Post Writer agent:
 * - POST /extended-post-writer/generate - Start content generation
 * - POST /extended-post-writer/resume/:threadId - Resume with HITL decision
 * - GET /extended-post-writer/status/:threadId - Check generation status
 * - GET /extended-post-writer/history/:threadId - Get full state history
 *
 * ## Communication Protocol
 * These endpoints use REST for **internal** service-to-service communication
 * between the API app (apps/api) and the LangGraph app (apps/langgraph).
 * The A2A (Agent-to-Agent) JSON-RPC 2.0 protocol is handled at the API app
 * level by the AgentRunner, which translates A2A requests into REST calls
 * to these endpoints. External clients should use the API app's A2A endpoints,
 * not these internal REST endpoints directly.
 */
@Controller('extended-post-writer')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class ExtendedPostWriterController {
  private readonly logger = new Logger(ExtendedPostWriterController.name);

  constructor(
    private readonly extendedPostWriterService: ExtendedPostWriterService,
  ) {}

  /**
   * Start content generation (will pause at HITL)
   */
  @Post('generate')
  @HttpCode(HttpStatus.OK)
  async generate(@Body() request: ExtendedPostWriterRequestDto) {
    // ExecutionContext is required - no fallbacks
    if (!request.context) {
      throw new BadRequestException('ExecutionContext is required');
    }

    const context = request.context;
    this.logger.log(
      `Received generation request: conversationId=${context.conversationId}, userId=${context.userId}`,
    );

    try {
      const result = await this.extendedPostWriterService.generate({
        context,
        userMessage: request.userMessage,
        additionalContext: request.contextInfo,
        keywords: request.keywords,
        tone: request.tone,
      });

      // Log HITL status for debugging
      this.logger.log(
        `[ExtendedPostWriter] Generation result: conversationId=${context.conversationId}, status=${result.status}, hasGeneratedContent=${!!result.generatedContent}`,
      );

      // Ensure HITL waiting status is properly returned
      if (result.status === 'hitl_waiting') {
        this.logger.log(
          `[ExtendedPostWriter] HITL waiting detected: conversationId=${context.conversationId}`,
        );
      }

      return {
        success: result.status !== 'failed',
        data: result,
        message:
          result.status === 'hitl_waiting'
            ? 'Content generated. Awaiting human review.'
            : undefined,
      };
    } catch (error) {
      this.logger.error('Generation failed:', error);
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Generation failed',
      );
    }
  }

  /**
   * Resume from HITL with approval decision
   *
   * This endpoint loads the checkpointed state, resumes with Command(resume),
   * and returns the final result after the workflow completes.
   */
  @Post('resume/:threadId')
  @HttpCode(HttpStatus.OK)
  async resume(
    @Param('threadId') threadId: string,
    @Body() request: ExtendedPostWriterResumeDto,
  ) {
    this.logger.log(
      `Resuming thread: ${threadId}, decision: ${request.decision}`,
    );

    try {
      const result = await this.extendedPostWriterService.resume(threadId, {
        decision: request.decision,
        editedContent: request.editedContent,
        feedback: request.feedback,
      });

      return {
        success: result.status !== 'failed',
        data: result,
        message:
          result.status === 'completed'
            ? 'Content finalized successfully.'
            : result.status === 'rejected'
              ? 'Content rejected.'
              : undefined,
      };
    } catch (error) {
      this.logger.error(`Resume failed for thread ${threadId}:`, error);
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Resume failed',
      );
    }
  }

  /**
   * Get generation status by thread ID
   */
  @Get('status/:threadId')
  @HttpCode(HttpStatus.OK)
  async getStatus(@Param('threadId') threadId: string) {
    this.logger.log(`Getting status for thread: ${threadId}`);

    const status = await this.extendedPostWriterService.getStatus(threadId);

    if (!status) {
      throw new NotFoundException(`Generation not found: ${threadId}`);
    }

    return {
      success: true,
      data: status,
    };
  }

  /**
   * Get full state history for a thread
   */
  @Get('history/:threadId')
  @HttpCode(HttpStatus.OK)
  async getHistory(@Param('threadId') threadId: string) {
    this.logger.log(`Getting history for thread: ${threadId}`);

    const history = await this.extendedPostWriterService.getHistory(threadId);

    if (history.length === 0) {
      throw new NotFoundException(`Generation not found: ${threadId}`);
    }

    return {
      success: true,
      data: history,
      count: history.length,
    };
  }
}
