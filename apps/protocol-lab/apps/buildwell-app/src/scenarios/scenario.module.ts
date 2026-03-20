import { Module } from '@nestjs/common';
import { ScenarioController } from './scenario.controller';
import { ScenarioService } from './scenario.service';
import { BuildwellModule } from '../buildwell/buildwell.module';
import { AlloytechModule } from '../alloytech/alloytech.module';
import { ApexOemModule } from '../apex-oem/apex-oem.module';

@Module({
  imports: [BuildwellModule, AlloytechModule, ApexOemModule],
  controllers: [ScenarioController],
  providers: [ScenarioService],
})
export class ScenarioModule {}
