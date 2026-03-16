import { Injectable } from '@nestjs/common';
import { DataLoaderService } from '@agent-communication/shared-protocols';
import { join } from 'path';

export interface ProductionScheduleRecord {
  id: string;
  batchNumber: string;
  productId: string;
  productCode: string;
  facility: string;
  quantityGallons: number;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  assignedLine: string;
  orderId: string | null;
  [key: string]: unknown;
}

export interface InventoryRecord {
  id: string;
  productId: string;
  productCode: string;
  facility: string;
  quantityGallons: number;
  reorderPointGallons: number;
  maxCapacityGallons: number;
  lastUpdated: string;
  status: string;
  [key: string]: unknown;
}

interface TestResult {
  testCode: string;
  parameter: string;
  value: number;
  unit: string;
  minSpec: number | null;
  maxSpec: number | null;
  pass: boolean;
  [key: string]: unknown;
}

export interface BatchRecord {
  id: string;
  batchNumber: string;
  productId: string;
  productCode: string;
  facility: string;
  manufacturedDate: string;
  testResults: TestResult[];
  overallStatus: string;
  disposition: string;
  inspectorId: string;
  notes: string;
  [key: string]: unknown;
}

interface QualityStandardParameter {
  name: string;
  unit: string;
  minValue: number | null;
  maxValue: number | null;
  [key: string]: unknown;
}

export interface QualityStandard {
  id: string;
  testCode: string;
  testName: string;
  description: string;
  applicableProducts: string[];
  parameters: QualityStandardParameter[];
  sampleSizeml: number;
  testDurationHours: number;
  [key: string]: unknown;
}

interface ShippingRoute {
  id: string;
  originFacility: string;
  destinationRegion: string;
  carrier: string;
  transitDays: number;
  costPerGallon: number;
  minimumGallons: number;
  serviceLevel: string;
  hazmatCertified: boolean;
  [key: string]: unknown;
}

export interface ScheduleBatchResult {
  scheduled: boolean;
  confirmationNumber: string;
  productId: string;
  quantityGallons: number;
  facility: string;
  orderId: string | undefined;
  nextAvailableSlot: {
    startDate: string;
    endDate: string;
    assignedLine: string;
  };
  message: string;
}

export interface InspectQualityResult {
  batchNumber: string;
  productCode: string;
  facility: string;
  manufacturedDate: string;
  overallStatus: string;
  disposition: string;
  testResults: TestResult[];
  failedTests: TestResult[];
  updatedDisposition: string | null;
  message: string;
}

export interface CalculateShippingResult {
  found: boolean;
  routes: Array<{
    routeId: string;
    carrier: string;
    originFacility: string;
    destinationRegion: string;
    transitDays: number;
    serviceLevel: string;
    quantityGallons: number;
    totalCost: number;
    costPerGallon: number;
    meetsMinimum: boolean;
    hazmatCertified: boolean;
  }>;
  message: string;
}

@Injectable()
export class LubeTechService {
  private readonly dataLoader: DataLoaderService;
  private static readonly ORG_ID = 'lube-tech';

  constructor() {
    this.dataLoader = new DataLoaderService({
      baseDir: join(process.cwd(), 'data'),
      watch: process.env.NODE_ENV !== 'production',
    });
  }

  scheduleBatch(params: {
    productId: string;
    quantityGallons: number;
    facility: string;
    orderId?: string;
  }): ScheduleBatchResult {
    const scheduleFile = this.dataLoader.loadFile<ProductionScheduleRecord>(
      LubeTechService.ORG_ID,
      'production-schedule',
    );

    // Find the latest scheduled end date for the given facility to determine next available slot
    const facilityRecords = scheduleFile.records.filter(
      (r) => r.facility === params.facility && (r.status === 'scheduled' || r.status === 'in-progress'),
    );

    let nextStartDate: Date;
    let assignedLine = 'Blending Line A';

    if (facilityRecords.length === 0) {
      nextStartDate = new Date();
    } else {
      const latestEnd = facilityRecords.reduce((latest, r) => {
        const endDate = new Date(r.scheduledEnd);
        return endDate > latest ? endDate : latest;
      }, new Date(0));
      nextStartDate = new Date(latestEnd);
      nextStartDate.setDate(nextStartDate.getDate() + 1);

      // Use the line from the last scheduled record for this facility
      const lastRecord = facilityRecords.sort(
        (a, b) => new Date(b.scheduledEnd).getTime() - new Date(a.scheduledEnd).getTime(),
      )[0];
      assignedLine = lastRecord.assignedLine;
    }

    // Estimate production duration: ~3000 gallons per day
    const productionDays = Math.max(1, Math.ceil(params.quantityGallons / 3000));
    const endDate = new Date(nextStartDate);
    endDate.setDate(endDate.getDate() + productionDays - 1);

    const confirmationNumber = `SCHED-${Date.now().toString().slice(-8)}`;

    return {
      scheduled: true,
      confirmationNumber,
      productId: params.productId,
      quantityGallons: params.quantityGallons,
      facility: params.facility,
      orderId: params.orderId,
      nextAvailableSlot: {
        startDate: nextStartDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        assignedLine,
      },
      message: `Production batch scheduled for ${params.facility}. Confirmation: ${confirmationNumber}. Estimated ${productionDays} day(s) of production starting ${nextStartDate.toISOString().split('T')[0]}.`,
    };
  }

  checkInventory(params: { productId?: string; facility?: string }): InventoryRecord[] {
    const inventoryFile = this.dataLoader.loadFile<InventoryRecord>(
      LubeTechService.ORG_ID,
      'inventory-levels',
    );

    return inventoryFile.records.filter((record) => {
      if (params.productId && record.productId !== params.productId) return false;
      if (params.facility && record.facility !== params.facility) return false;
      return true;
    });
  }

  inspectQuality(params: { batchNumber: string }): InspectQualityResult {
    const batchFile = this.dataLoader.loadFile<BatchRecord>(
      LubeTechService.ORG_ID,
      'batch-records',
    );

    const batch = batchFile.records.find((r) => r.batchNumber === params.batchNumber);
    if (!batch) {
      throw new Error(`Batch not found: ${params.batchNumber}`);
    }

    this.dataLoader.loadFile<QualityStandard>(
      LubeTechService.ORG_ID,
      'quality-standards',
    );

    const failedTests = batch.testResults.filter((t) => !t.pass);
    let updatedDisposition: string | null = null;
    let message: string;

    if (failedTests.length > 0 && batch.disposition !== 'hold') {
      // Update disposition to hold when quality failures are detected
      const updated = this.dataLoader.updateRecord<BatchRecord>(
        LubeTechService.ORG_ID,
        'batch-records',
        batch.id,
        { disposition: 'hold', overallStatus: 'conditional' },
      );
      updatedDisposition = updated.disposition;
      message = `Quality inspection found ${failedTests.length} failed test(s) for batch ${params.batchNumber}. Disposition updated to 'hold'. Failed parameters: ${failedTests.map((t) => t.parameter).join(', ')}.`;
    } else if (failedTests.length === 0) {
      message = `Quality inspection passed for batch ${params.batchNumber}. All ${batch.testResults.length} test(s) within specification. Disposition: ${batch.disposition}.`;
    } else {
      message = `Batch ${params.batchNumber} already on hold with ${failedTests.length} failed test(s). Failed parameters: ${failedTests.map((t) => t.parameter).join(', ')}.`;
    }

    return {
      batchNumber: batch.batchNumber,
      productCode: batch.productCode,
      facility: batch.facility,
      manufacturedDate: batch.manufacturedDate,
      overallStatus: batch.overallStatus,
      disposition: batch.disposition,
      testResults: batch.testResults,
      failedTests,
      updatedDisposition,
      message,
    };
  }

  calculateShipping(params: {
    originFacility: string;
    destinationRegion: string;
    quantityGallons: number;
  }): CalculateShippingResult {
    const routesFile = this.dataLoader.loadFile<ShippingRoute>(
      LubeTechService.ORG_ID,
      'shipping-routes',
    );

    const matchingRoutes = routesFile.records.filter((route) => {
      if (route.originFacility !== params.originFacility) return false;
      // Match destination region by substring to support partial matches
      return route.destinationRegion.toLowerCase().includes(params.destinationRegion.toLowerCase()) ||
        params.destinationRegion.toLowerCase().includes(route.destinationRegion.toLowerCase().split(' ')[0]);
    });

    if (matchingRoutes.length === 0) {
      return {
        found: false,
        routes: [],
        message: `No shipping routes found from ${params.originFacility} to ${params.destinationRegion}.`,
      };
    }

    const routes = matchingRoutes.map((route) => ({
      routeId: route.id,
      carrier: route.carrier,
      originFacility: route.originFacility,
      destinationRegion: route.destinationRegion,
      transitDays: route.transitDays,
      serviceLevel: route.serviceLevel,
      quantityGallons: params.quantityGallons,
      totalCost: Math.round(route.costPerGallon * params.quantityGallons * 100) / 100,
      costPerGallon: route.costPerGallon,
      meetsMinimum: params.quantityGallons >= route.minimumGallons,
      hazmatCertified: route.hazmatCertified,
    }));

    return {
      found: true,
      routes,
      message: `Found ${routes.length} route(s) from ${params.originFacility} to ${params.destinationRegion} for ${params.quantityGallons} gallons.`,
    };
  }

  getProductionSchedule(): ProductionScheduleRecord[] {
    const scheduleFile = this.dataLoader.loadFile<ProductionScheduleRecord>(
      LubeTechService.ORG_ID,
      'production-schedule',
    );
    return scheduleFile.records;
  }

  getInventoryLevels(): InventoryRecord[] {
    const inventoryFile = this.dataLoader.loadFile<InventoryRecord>(
      LubeTechService.ORG_ID,
      'inventory-levels',
    );
    return inventoryFile.records;
  }

  getBatchRecords(): BatchRecord[] {
    const batchFile = this.dataLoader.loadFile<BatchRecord>(
      LubeTechService.ORG_ID,
      'batch-records',
    );
    return batchFile.records;
  }

  getQualityStandards(): QualityStandard[] {
    const standardsFile = this.dataLoader.loadFile<QualityStandard>(
      LubeTechService.ORG_ID,
      'quality-standards',
    );
    return standardsFile.records;
  }
}
