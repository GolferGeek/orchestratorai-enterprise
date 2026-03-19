import { Module } from '@nestjs/common';
import { ScenarioController } from './scenario.controller';
import { ScenarioService } from './scenario.service';
import { AscentekModule } from '../ascentek/ascentek.module';
import { LubeTechModule } from '../lube-tech/lube-tech.module';
import { OemPartnerModule } from '../oem-partner/oem-partner.module';

@Module({
  imports: [AscentekModule, LubeTechModule, OemPartnerModule],
  controllers: [ScenarioController],
  providers: [ScenarioService],
})
export class ScenarioModule {}
