import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import {
  AlloytechService,
  ScheduleBatchResult,
  InspectQualityResult,
  CalculateShippingResult,
  ProductionScheduleRecord,
  InventoryRecord,
  BatchRecord,
  QualityStandard,
} from './alloytech.service';

interface ScheduleBatchBody {
  productId: string;
  quantityGallons: number;
  facility: string;
  orderId?: string;
}

interface InspectQualityBody {
  batchNumber: string;
}

interface CalculateShippingBody {
  originFacility: string;
  destinationRegion: string;
  quantityGallons: number;
}

@Controller('alloytech')
export class AlloytechController {
  constructor(private readonly alloytechService: AlloytechService) {}

  @Post('production/schedule')
  scheduleBatch(@Body() body: ScheduleBatchBody): ScheduleBatchResult {
    return this.alloytechService.scheduleBatch(body);
  }

  @Get('inventory/check')
  checkInventory(
    @Query('productId') productId?: string,
    @Query('facility') facility?: string,
  ): InventoryRecord[] {
    return this.alloytechService.checkInventory({ productId, facility });
  }

  @Post('quality/inspect')
  inspectQuality(@Body() body: InspectQualityBody): InspectQualityResult {
    return this.alloytechService.inspectQuality(body);
  }

  @Post('shipping/route')
  calculateShipping(@Body() body: CalculateShippingBody): CalculateShippingResult {
    return this.alloytechService.calculateShipping(body);
  }

  @Get('production')
  getProductionSchedule(): ProductionScheduleRecord[] {
    return this.alloytechService.getProductionSchedule();
  }

  @Get('inventory')
  getInventoryLevels(): InventoryRecord[] {
    return this.alloytechService.getInventoryLevels();
  }

  @Get('batches')
  getBatchRecords(): BatchRecord[] {
    return this.alloytechService.getBatchRecords();
  }

  @Get('quality-standards')
  getQualityStandards(): QualityStandard[] {
    return this.alloytechService.getQualityStandards();
  }
}
