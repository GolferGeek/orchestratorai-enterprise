import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HealthController } from './health/health.controller';
import { AgentCardModule } from './agent-card/agent-card.module';
import { WellKnownController } from './well-known/well-known.controller';
import { MessageLoggingInterceptor, ProtocolFactoryModule } from '@agent-communication/shared-protocols';
import { AscentekModule } from './ascentek/ascentek.module';
import { LubeTechModule } from './lube-tech/lube-tech.module';
import { OemPartnerModule } from './oem-partner/oem-partner.module';
import { ScenarioModule } from './scenarios/scenario.module';
import { SourceCodeController } from './source-code/source-code.controller';
import { DataModule } from './data/data.module';

@Module({
  imports: [ProtocolFactoryModule, AgentCardModule, AscentekModule, LubeTechModule, OemPartnerModule, ScenarioModule, DataModule],
  controllers: [HealthController, WellKnownController, SourceCodeController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useValue: new MessageLoggingInterceptor('ascentek-app'),
    },
  ],
})
export class AppModule {}
