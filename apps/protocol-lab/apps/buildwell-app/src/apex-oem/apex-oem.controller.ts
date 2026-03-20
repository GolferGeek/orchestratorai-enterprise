import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { ApexOemService } from './apex-oem.service';

interface SubmitPoBody {
  poId: string;
}

interface PlaceBidBody {
  specCode: string;
  quantityGallons: number;
  maxPricePerGallon: number;
}

@Controller('oem')
export class ApexOemController {
  constructor(private readonly apexOemService: ApexOemService) {}

  @Post('po/submit')
  submitPurchaseOrder(@Body() body: SubmitPoBody) {
    return this.apexOemService.submitPurchaseOrder(body.poId);
  }

  @Get('specs/query')
  querySpecAvailability(@Query('specCode') specCode: string) {
    return this.apexOemService.querySpecAvailability(specCode);
  }

  @Get('orders/track')
  trackOrder(@Query('poId') poId: string) {
    return this.apexOemService.trackOrder(poId);
  }

  @Post('bids/place')
  placeBid(@Body() body: PlaceBidBody) {
    return this.apexOemService.placeBid(body);
  }

  @Get('purchase-orders')
  getPurchaseOrders() {
    return this.apexOemService.getPurchaseOrders();
  }

  @Get('spec-requirements')
  getSpecRequirements() {
    return this.apexOemService.getSpecRequirements();
  }

  @Get('order-history')
  getOrderHistory() {
    return this.apexOemService.getOrderHistory();
  }

  @Get('quality-complaints')
  getQualityComplaints() {
    return this.apexOemService.getQualityComplaints();
  }

  @Get('approved-suppliers')
  getApprovedSuppliers() {
    return this.apexOemService.getApprovedSuppliers();
  }
}
