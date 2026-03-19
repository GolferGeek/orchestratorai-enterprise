import { Module } from '@nestjs/common';
import { FcsFinancialController } from './fcs-financial.controller';
import { FcsFinancialService } from './fcs-financial.service';

@Module({
  controllers: [FcsFinancialController],
  providers: [FcsFinancialService],
  exports: [FcsFinancialService],
})
export class FcsFinancialModule {}
