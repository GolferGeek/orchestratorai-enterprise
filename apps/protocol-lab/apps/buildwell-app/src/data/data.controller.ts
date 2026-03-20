import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { DataLoaderService, ReconciliationService } from '@agent-communication/shared-protocols';
import { join } from 'path';

@Controller('api/data')
export class DataController {
  private readonly dataLoader: DataLoaderService;
  private readonly reconciliation: ReconciliationService;

  constructor() {
    const baseDir = join(process.cwd(), 'data');
    this.dataLoader = new DataLoaderService({ baseDir });
    this.reconciliation = new ReconciliationService(this.dataLoader);
  }

  /**
   * GET /api/data/transactions/:company
   * Must be declared BEFORE /:company/:file to prevent shadowing.
   */
  @Get('transactions/:company')
  getTransactions(@Param('company') company: string) {
    return this.dataLoader.loadFile(company, 'transactions');
  }

  /**
   * GET /api/data/reconcile/:company
   * Must be declared BEFORE /:company/:file to prevent shadowing.
   */
  @Get('reconcile/:company')
  async reconcile(@Param('company') company: string) {
    return this.reconciliation.reconcile(company);
  }

  @Get(':company/:file')
  getFile(@Param('company') company: string, @Param('file') file: string) {
    const dataFile = this.dataLoader.loadFile(company, file);
    if (!dataFile) {
      throw new NotFoundException(`Data file not found: ${company}/${file}`);
    }
    return dataFile;
  }

  @Get(':company/:file/:recordId')
  getRecord(
    @Param('company') company: string,
    @Param('file') file: string,
    @Param('recordId') recordId: string,
  ) {
    const record = this.dataLoader.getById(company, file, recordId);
    if (!record) {
      throw new NotFoundException(`Record not found: ${company}/${file}#${recordId}`);
    }
    return record;
  }
}
