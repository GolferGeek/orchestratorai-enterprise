import { Controller, Post, Get, Body, BadRequestException } from '@nestjs/common';
import { AgribankService } from './agribank.service';

interface OversightReviewBody {
  quarter: string;
  associationIds?: string[];
}

interface StressTestBody {
  scenario: string;
}

@Controller('agribank')
export class AgribankController {
  constructor(private readonly agribankService: AgribankService) {}

  @Post('oversight/review')
  async performOversightReview(@Body() body: OversightReviewBody): Promise<Record<string, unknown>> {
    if (!body.quarter) {
      throw new BadRequestException('quarter is required');
    }
    return this.agribankService.performOversightReview({
      quarter: body.quarter,
      associationIds: body.associationIds,
    });
  }

  @Post('stress-test')
  async runStressTest(@Body() body: StressTestBody): Promise<Record<string, unknown>> {
    if (!body.scenario) {
      throw new BadRequestException('scenario is required (baseline|adverse|severe)');
    }
    const validScenarios = ['baseline', 'adverse', 'severe'];
    if (!validScenarios.includes(body.scenario)) {
      throw new BadRequestException(`scenario must be one of: ${validScenarios.join(', ')}`);
    }
    return this.agribankService.runStressTest({ scenario: body.scenario });
  }

  @Get('examination-criteria')
  getExaminationCriteria(): unknown[] {
    return this.agribankService.getExaminationCriteria();
  }

  @Get('capital-requirements')
  getCapitalRequirements(): unknown[] {
    return this.agribankService.getCapitalRequirements();
  }

  @Get('ratings')
  getAssociationRatings(): unknown[] {
    return this.agribankService.getAssociationRatings();
  }

  @Get('risk-limits')
  getRiskConcentrationLimits(): unknown[] {
    return this.agribankService.getRiskConcentrationLimits();
  }
}
