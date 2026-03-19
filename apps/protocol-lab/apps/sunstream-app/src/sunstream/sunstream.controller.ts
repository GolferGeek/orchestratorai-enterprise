import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { SunstreamService } from './sunstream.service';

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

@Controller('sunstream')
export class SunstreamController {
  constructor(private readonly sunstreamService: SunstreamService) {}

  @Post('compliance/validate')
  validateLoanCompliance(@Body() body: ValidateLoanBody) {
    return this.sunstreamService.validateLoanCompliance(body);
  }

  @Post('helpdesk/ticket')
  triageHelpdeskTicket(@Body() body: HelpdeskTicketBody) {
    return this.sunstreamService.triageHelpdeskTicket(body);
  }

  @Get('reporting/quarterly')
  generateQuarterlyReport(
    @Query('quarter') quarter: string,
    @Query('associationIds') associationIds?: string,
  ) {
    const parsedAssociationIds = associationIds
      ? associationIds.split(',').map((id) => id.trim())
      : undefined;

    return this.sunstreamService.generateQuarterlyReport({
      quarter,
      associationIds: parsedAssociationIds,
    });
  }

  @Get('services')
  getServiceCatalog() {
    return this.sunstreamService.getServiceCatalog();
  }

  @Get('associations')
  getAssociations() {
    return this.sunstreamService.getAssociations();
  }
}
