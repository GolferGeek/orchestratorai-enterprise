import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { IsString, IsNotEmpty } from 'class-validator';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { IsValidExecutionContext } from '../shared/common/validators/execution-context.validator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { HrAssistantService } from './hr-assistant.service';

/**
 * Request DTO for the HR Assistant endpoint
 */
export class HrAssistantRequestDto {
  @IsValidExecutionContext()
  context!: ExecutionContext;

  @IsString()
  @IsNotEmpty()
  userMessage!: string;
}

/**
 * HrAssistantController
 *
 * Internal REST endpoint consumed by the API app's agent runner.
 * External clients use the API app's A2A endpoints — not this endpoint directly.
 *
 * POST /conversions/hr-assistant/execute
 */
@Controller('conversions/hr-assistant')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class HrAssistantController {
  private readonly logger = new Logger(HrAssistantController.name);

  constructor(private readonly hrAssistantService: HrAssistantService) {}

  /**
   * Execute an HR policy query
   */
  @Post('execute')
  @HttpCode(HttpStatus.OK)
  async execute(@Body() request: HrAssistantRequestDto) {
    if (!request.context) {
      throw new BadRequestException('ExecutionContext is required');
    }

    this.logger.log(
      `Received HR Assistant request: conversationId=${request.context.conversationId}, userId=${request.context.userId}`,
    );

    const result = await this.hrAssistantService.execute({
      context: request.context,
      userMessage: request.userMessage,
    });

    return {
      success: result.status === 'completed',
      data: result,
    };
  }
}
