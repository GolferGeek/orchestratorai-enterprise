import { Controller, Post, Get, Body } from '@nestjs/common';
import { FcsFinancialService } from './fcs-financial.service';

interface SubmitLoanBody {
  loanId: string;
}

interface HelpdeskRequestBody {
  category: string;
  symptoms: string[];
  description: string;
}

@Controller('fcs')
export class FcsFinancialController {
  constructor(private readonly fcsFinancialService: FcsFinancialService) {}

  @Post('loans/submit')
  submitLoanForCompliance(@Body() body: SubmitLoanBody) {
    return this.fcsFinancialService.submitLoanForCompliance(body.loanId);
  }

  @Post('helpdesk/request')
  requestHelpdeskSupport(@Body() body: HelpdeskRequestBody) {
    return this.fcsFinancialService.requestHelpdeskSupport(
      body.category,
      body.symptoms,
      body.description,
    );
  }

  @Get('portfolio')
  getPortfolio() {
    return this.fcsFinancialService.getPortfolio();
  }

  @Get('loans')
  getLoanApplications() {
    return this.fcsFinancialService.getLoanApplications();
  }

  @Get('borrowers')
  getBorrowers() {
    return this.fcsFinancialService.getBorrowers();
  }

  @Get('rates')
  getRateSheet() {
    return this.fcsFinancialService.getRateSheet();
  }

  @Get('collateral')
  getCollateral() {
    return this.fcsFinancialService.getCollateral();
  }
}
