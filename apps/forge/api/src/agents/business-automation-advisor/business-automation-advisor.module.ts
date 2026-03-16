import { Module } from '@nestjs/common';
import { BusinessAutomationAdvisorController } from './business-automation-advisor.controller';
import { BusinessAutomationAdvisorService } from './business-automation-advisor.service';
import { BusinessAutomationAdvisorDbService } from './business-automation-advisor-db.service';

/**
 * BusinessAutomationAdvisorModule
 *
 * Provides the Business Automation Advisor agent for generating
 * AI agent recommendations based on a user's industry/business type.
 *
 * This is used by the landing page "Agent Ideas" feature to help
 * potential customers discover what agents could help their business.
 */
@Module({
  controllers: [BusinessAutomationAdvisorController],
  providers: [
    BusinessAutomationAdvisorService,
    BusinessAutomationAdvisorDbService,
  ],
  exports: [BusinessAutomationAdvisorService],
})
export class BusinessAutomationAdvisorModule {}
