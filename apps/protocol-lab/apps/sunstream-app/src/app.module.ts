import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HealthController } from './health/health.controller';
import { AgentCardModule } from './agent-card/agent-card.module';
import { WellKnownController } from './well-known/well-known.controller';
import { MessageLoggingInterceptor, ProtocolFactoryModule } from '@agent-communication/shared-protocols';
import { SunstreamModule } from './sunstream/sunstream.module';
import { FcsFinancialModule } from './fcs-financial/fcs-financial.module';
import { AgribankModule } from './agribank/agribank.module';
import { ScenarioModule } from './scenarios/scenario.module';
import { DataModule } from './data/data.module';
import { SourceCodeController } from './source-code/source-code.controller';

@Module({
  imports: [ProtocolFactoryModule, AgentCardModule, SunstreamModule, FcsFinancialModule, AgribankModule, ScenarioModule, DataModule],
  controllers: [HealthController, WellKnownController, SourceCodeController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useValue: new MessageLoggingInterceptor('sunstream-app'),
    },
  ],
})
export class AppModule {}
