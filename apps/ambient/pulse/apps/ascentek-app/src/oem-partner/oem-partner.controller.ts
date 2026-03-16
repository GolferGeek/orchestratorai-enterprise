import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { OemPartnerService } from './oem-partner.service';

interface SubmitPoBody {
  poId: string;
}

interface PlaceBidBody {
  specCode: string;
  quantityGallons: number;
  maxPricePerGallon: number;
}

@Controller('oem')
export class OemPartnerController {
  constructor(private readonly oemPartnerService: OemPartnerService) {}

  @Post('po/submit')
  submitPurchaseOrder(@Body() body: SubmitPoBody) {
    return this.oemPartnerService.submitPurchaseOrder(body.poId);
  }

  @Get('specs/query')
  querySpecAvailability(@Query('specCode') specCode: string) {
    return this.oemPartnerService.querySpecAvailability(specCode);
  }

  @Get('orders/track')
  trackOrder(@Query('poId') poId: string) {
    return this.oemPartnerService.trackOrder(poId);
  }

  @Post('bids/place')
  placeBid(@Body() body: PlaceBidBody) {
    return this.oemPartnerService.placeBid(body);
  }

  @Get('purchase-orders')
  getPurchaseOrders() {
    return this.oemPartnerService.getPurchaseOrders();
  }

  @Get('spec-requirements')
  getSpecRequirements() {
    return this.oemPartnerService.getSpecRequirements();
  }

  @Get('order-history')
  getOrderHistory() {
    return this.oemPartnerService.getOrderHistory();
  }

  @Get('quality-complaints')
  getQualityComplaints() {
    return this.oemPartnerService.getQualityComplaints();
  }

  @Get('approved-suppliers')
  getApprovedSuppliers() {
    return this.oemPartnerService.getApprovedSuppliers();
  }
}
