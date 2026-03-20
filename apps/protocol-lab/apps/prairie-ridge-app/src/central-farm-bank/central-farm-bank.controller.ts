import { Controller, Post, Get, Body, BadRequestException } from '@nestjs/common';
import { CentralFarmBankService } from './central-farm-bank.service';

interface OversightReviewBody {
  quarter: string;
  associationIds?: string[];
}

interface StressTestBody {
  scenario: string;
}

@Controller('central-farm-bank')
export class CentralFarmBankController {
  constructor(private readonly centralFarmBankService: CentralFarmBankService) {}

  @Post('oversight/review')
  async performOversightReview(@Body() body: OversightReviewBody): Promise<Record<string, unknown>> {
    if (!body.quarter) {
      throw new BadRequestException('quarter is required');
    }
    return this.centralFarmBankService.performOversightReview({
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
    return this.centralFarmBankService.runStressTest({ scenario: body.scenario });
  }

  @Get('examination-criteria')
  getExaminationCriteria(): unknown[] {
    return this.centralFarmBankService.getExaminationCriteria();
  }

  @Get('capital-requirements')
  getCapitalRequirements(): unknown[] {
    return this.centralFarmBankService.getCapitalRequirements();
  }

  @Get('ratings')
  getAssociationRatings(): unknown[] {
    return this.centralFarmBankService.getAssociationRatings();
  }

  @Get('risk-limits')
  getRiskConcentrationLimits(): unknown[] {
    return this.centralFarmBankService.getRiskConcentrationLimits();
  }
}
