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
} from '@nestjs/common';
import { LegalDepartmentService } from './legal-department.service';
import { LegalDepartmentRequestDto } from './dto';

/**
 * LegalDepartmentController
 *
 * REST API endpoints for the Legal Department AI agent:
 * - POST /legal-department/process - Start a new legal workflow
 * - GET /legal-department/status/:threadId - Check workflow status
 * - GET /legal-department/history/:threadId - Get full state history
 *
 * Phase 3 (M0): Simple echo workflow to prove LLM integration
 * Future phases: Document analysis, compliance checking, risk assessment
 */
@Controller('legal-department')
export class LegalDepartmentController {
  private readonly logger = new Logger(LegalDepartmentController.name);

  constructor(
    private readonly legalDepartmentService: LegalDepartmentService,
  ) {}

  /**
   * Start a new legal department workflow (root endpoint)
   * This handles POST /legal-department requests from the API agent configuration
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async processRoot(@Body() request: LegalDepartmentRequestDto) {
    return this.process(request);
  }

  /**
   * Start a new legal department workflow
   */
  @Post('process')
  @HttpCode(HttpStatus.OK)
  async process(@Body() request: LegalDepartmentRequestDto) {
    // ExecutionContext is required - no fallbacks
    if (!request.context) {
      throw new BadRequestException('ExecutionContext is required');
    }

    const context = request.context;
    this.logger.log(
      `Received legal department request: conversationId=${context.conversationId}, userId=${context.userId}, documents=${request.documents?.length || 0}, hasLegalMetadata=${!!request.legalMetadata}`,
    );

    try {
      const result = await this.legalDepartmentService.process({
        context,
        userMessage: request.userMessage,
        documents: request.documents,
        legalMetadata: request.legalMetadata,
      });

      return {
        success: result.status === 'completed',
        data: result,
      };
    } catch (error) {
      this.logger.error('Legal department workflow failed:', error);
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Workflow failed',
      );
    }
  }

  /**
   * Get workflow status by thread ID
   */
  @Get('status/:threadId')
  @HttpCode(HttpStatus.OK)
  async getStatus(@Param('threadId') threadId: string) {
    this.logger.log(`Getting status for thread: ${threadId}`);

    const status = await this.legalDepartmentService.getStatus(threadId);

    if (!status) {
      throw new NotFoundException(`Workflow not found: ${threadId}`);
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

    const history = await this.legalDepartmentService.getHistory(threadId);

    if (history.length === 0) {
      throw new NotFoundException(`Workflow not found: ${threadId}`);
    }

    return {
      success: true,
      data: history,
      count: history.length,
    };
  }
}
