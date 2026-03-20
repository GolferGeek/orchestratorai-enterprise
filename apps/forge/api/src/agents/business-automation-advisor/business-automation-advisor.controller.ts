import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { BusinessAutomationAdvisorService } from './business-automation-advisor.service';
import { BusinessAutomationAdvisorRequestDto, SubmitInterestDto } from './dto';

/**
 * BusinessAutomationAdvisorController
 *
 * REST API endpoint for the Business Automation Advisor agent:
 * - POST /business-automation-advisor/generate - Get agent recommendations for an industry
 * - POST /business-automation-advisor/submit - Submit interest in selected agents
 */
@Controller('business-automation-advisor')
export class BusinessAutomationAdvisorController {
  private readonly logger = new Logger(
    BusinessAutomationAdvisorController.name,
  );

  constructor(
    private readonly businessAutomationAdvisorService: BusinessAutomationAdvisorService,
  ) {}

  /**
   * Generate agent recommendations for an industry
   *
   * Takes an industry/business type and returns 8-10 AI agent recommendations
   * that could help automate their business processes.
   */
  @Post('generate')
  @HttpCode(HttpStatus.OK)
  async generate(@Body() request: BusinessAutomationAdvisorRequestDto) {
    // ExecutionContext is required
    if (!request.context) {
      throw new BadRequestException('ExecutionContext is required');
    }

    // Industry is required
    if (!request.industry || request.industry.trim().length === 0) {
      throw new BadRequestException('Industry input is required');
    }

    const context = request.context;
    this.logger.log(
      `Received generation request: conversationId=${context.conversationId}, industry=${request.industry}`,
    );

    try {
      const result = await this.businessAutomationAdvisorService.generate({
        context,
        industry: request.industry,
      });

      // Return the result directly - it has its own status field
      return result;
    } catch (error) {
      this.logger.error('Generation failed:', error);
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Generation failed',
      );
    }
  }

  /**
   * Submit interest in selected agents
   *
   * Stores lead submission in the database for follow-up.
   */
  @Post('submit')
  @HttpCode(HttpStatus.CREATED)
  async submit(@Body() request: SubmitInterestDto) {
    // Email is required
    if (!request.email) {
      throw new BadRequestException('Email is required');
    }

    // Selected agents are required
    if (!request.selectedAgents || request.selectedAgents.length === 0) {
      throw new BadRequestException('At least one agent must be selected');
    }

    this.logger.log(
      `Received submit request: email=${request.email}, selectedAgents=${request.selectedAgents.length}`,
    );

    try {
      const result =
        await this.businessAutomationAdvisorService.submitInterest(request);
      return result;
    } catch (error) {
      this.logger.error('Submission failed:', error);
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Submission failed',
      );
    }
  }
}
