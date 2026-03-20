import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { PrairieRidgeService } from './prairie-ridge.service';

interface ValidateLoanBody {
  loanId?: string;
  borrowerName?: string;
  amount?: number;
  purpose?: string;
  collateralType?: string;
  term?: number;
  rateType?: string;
  [key: string]: unknown;
}

interface HelpdeskTicketBody {
  category?: string;
  symptoms?: string[];
  description?: string;
}

@Controller('prairie-ridge')
export class PrairieRidgeController {
  constructor(private readonly prairieRidgeService: PrairieRidgeService) {}

  @Post('compliance/validate')
  validateLoanCompliance(@Body() body: ValidateLoanBody) {
    return this.prairieRidgeService.validateLoanCompliance(body);
  }

  @Post('helpdesk/ticket')
  triageHelpdeskTicket(@Body() body: HelpdeskTicketBody) {
    return this.prairieRidgeService.triageHelpdeskTicket(body);
  }

  @Get('reporting/quarterly')
  generateQuarterlyReport(
    @Query('quarter') quarter: string,
    @Query('associationIds') associationIds?: string,
  ) {
    const parsedAssociationIds = associationIds
      ? associationIds.split(',').map((id) => id.trim())
      : undefined;

    return this.prairieRidgeService.generateQuarterlyReport({
      quarter,
      associationIds: parsedAssociationIds,
    });
  }

  @Get('services')
  getServiceCatalog() {
    return this.prairieRidgeService.getServiceCatalog();
  }

  @Get('associations')
  getAssociations() {
    return this.prairieRidgeService.getAssociations();
  }
}
