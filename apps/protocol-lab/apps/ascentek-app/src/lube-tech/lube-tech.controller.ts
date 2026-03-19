import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import {
  LubeTechService,
  ScheduleBatchResult,
  InspectQualityResult,
  CalculateShippingResult,
  ProductionScheduleRecord,
  InventoryRecord,
  BatchRecord,
  QualityStandard,
} from './lube-tech.service';

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

@Controller('lube-tech')
export class LubeTechController {
  constructor(private readonly lubeTechService: LubeTechService) {}

  @Post('production/schedule')
  scheduleBatch(@Body() body: ScheduleBatchBody): ScheduleBatchResult {
    return this.lubeTechService.scheduleBatch(body);
  }

  @Get('inventory/check')
  checkInventory(
    @Query('productId') productId?: string,
    @Query('facility') facility?: string,
  ): InventoryRecord[] {
    return this.lubeTechService.checkInventory({ productId, facility });
  }

  @Post('quality/inspect')
  inspectQuality(@Body() body: InspectQualityBody): InspectQualityResult {
    return this.lubeTechService.inspectQuality(body);
  }

  @Post('shipping/route')
  calculateShipping(@Body() body: CalculateShippingBody): CalculateShippingResult {
    return this.lubeTechService.calculateShipping(body);
  }

  @Get('production')
  getProductionSchedule(): ProductionScheduleRecord[] {
    return this.lubeTechService.getProductionSchedule();
  }

  @Get('inventory')
  getInventoryLevels(): InventoryRecord[] {
    return this.lubeTechService.getInventoryLevels();
  }

  @Get('batches')
  getBatchRecords(): BatchRecord[] {
    return this.lubeTechService.getBatchRecords();
  }

  @Get('quality-standards')
  getQualityStandards(): QualityStandard[] {
    return this.lubeTechService.getQualityStandards();
  }
}
