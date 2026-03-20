import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HealthController } from './health/health.controller';
import { AgentCardModule } from './agent-card/agent-card.module';
import { WellKnownController } from './well-known/well-known.controller';
import { MessageLoggingInterceptor, ProtocolFactoryModule } from '@agent-communication/shared-protocols';
import { BuildwellModule } from './buildwell/buildwell.module';
import { AlloytechModule } from './alloytech/alloytech.module';
import { ApexOemModule } from './apex-oem/apex-oem.module';
import { ScenarioModule } from './scenarios/scenario.module';
import { SourceCodeController } from './source-code/source-code.controller';
import { DataModule } from './data/data.module';

@Module({
  imports: [ProtocolFactoryModule, AgentCardModule, BuildwellModule, AlloytechModule, ApexOemModule, ScenarioModule, DataModule],
  controllers: [HealthController, WellKnownController, SourceCodeController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useValue: new MessageLoggingInterceptor('buildwell-app'),
    },
  ],
})
export class AppModule {}
