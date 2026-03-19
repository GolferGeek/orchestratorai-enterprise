import { Module } from '@nestjs/common';
import { ScenarioController } from './scenario.controller';
import { ScenarioService } from './scenario.service';
import { SunstreamModule } from '../sunstream/sunstream.module';
import { FcsFinancialModule } from '../fcs-financial/fcs-financial.module';
import { AgribankModule } from '../agribank/agribank.module';

@Module({
  imports: [SunstreamModule, FcsFinancialModule, AgribankModule],
  controllers: [ScenarioController],
  providers: [ScenarioService],
})
export class ScenarioModule {}
