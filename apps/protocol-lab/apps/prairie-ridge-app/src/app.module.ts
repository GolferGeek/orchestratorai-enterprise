import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HealthController } from './health/health.controller';
import { AgentCardModule } from './agent-card/agent-card.module';
import { WellKnownController } from './well-known/well-known.controller';
import { MessageLoggingInterceptor, ProtocolFactoryModule } from '@agent-communication/shared-protocols';
import { PrairieRidgeModule } from './prairie-ridge/prairie-ridge.module';
import { AgriservModule } from './agriserv/agriserv.module';
import { CentralFarmBankModule } from './central-farm-bank/central-farm-bank.module';
import { ScenarioModule } from './scenarios/scenario.module';
import { DataModule } from './data/data.module';
import { SourceCodeController } from './source-code/source-code.controller';

@Module({
  imports: [ProtocolFactoryModule, AgentCardModule, PrairieRidgeModule, AgriservModule, CentralFarmBankModule, ScenarioModule, DataModule],
  controllers: [HealthController, WellKnownController, SourceCodeController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useValue: new MessageLoggingInterceptor('prairie-ridge-app'),
    },
  ],
})
export class AppModule {}
