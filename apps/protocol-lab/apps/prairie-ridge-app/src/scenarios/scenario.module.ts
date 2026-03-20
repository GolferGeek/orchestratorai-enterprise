import { Module } from '@nestjs/common';
import { ScenarioController } from './scenario.controller';
import { ScenarioService } from './scenario.service';
import { PrairieRidgeModule } from '../prairie-ridge/prairie-ridge.module';
import { AgriservModule } from '../agriserv/agriserv.module';
import { CentralFarmBankModule } from '../central-farm-bank/central-farm-bank.module';

@Module({
  imports: [PrairieRidgeModule, AgriservModule, CentralFarmBankModule],
  controllers: [ScenarioController],
  providers: [ScenarioService],
})
export class ScenarioModule {}
