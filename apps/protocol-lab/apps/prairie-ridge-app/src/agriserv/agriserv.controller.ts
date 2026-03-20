import { Controller, Post, Get, Body } from '@nestjs/common';
import { AgriservService } from './agriserv.service';

interface SubmitLoanBody {
  loanId: string;
}

interface HelpdeskRequestBody {
  category: string;
  symptoms: string[];
  description: string;
}

@Controller('fcs')
export class AgriservController {
  constructor(private readonly agriservService: AgriservService) {}

  @Post('loans/submit')
  submitLoanForCompliance(@Body() body: SubmitLoanBody) {
    return this.agriservService.submitLoanForCompliance(body.loanId);
  }

  @Post('helpdesk/request')
  requestHelpdeskSupport(@Body() body: HelpdeskRequestBody) {
    return this.agriservService.requestHelpdeskSupport(
      body.category,
      body.symptoms,
      body.description,
    );
  }

  @Get('portfolio')
  getPortfolio() {
    return this.agriservService.getPortfolio();
  }

  @Get('loans')
  getLoanApplications() {
    return this.agriservService.getLoanApplications();
  }

  @Get('borrowers')
  getBorrowers() {
    return this.agriservService.getBorrowers();
  }

  @Get('rates')
  getRateSheet() {
    return this.agriservService.getRateSheet();
  }

  @Get('collateral')
  getCollateral() {
    return this.agriservService.getCollateral();
  }
}
