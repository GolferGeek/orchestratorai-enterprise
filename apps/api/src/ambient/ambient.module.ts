import { Module } from '@nestjs/common';
import { AmbientDatabaseModule } from './ambient-database/database.module';
import { EventBusModule } from './event-bus/event-bus.module';
import { ExecutionsModule } from './executions/executions.module';
import { InvokeModule as AmbientInvokeModule } from './invoke/invoke.module';
import { ListenersModule } from './listeners/listeners.module';
import { ScenariosModule } from './scenarios/scenarios.module';
import { ServicesModule } from './services/services.module';
import { StreamingModule } from './streaming/streaming.module';
import { TriggersModule } from './triggers/triggers.module';
import { WellKnownModule } from './well-known/well-known.module';
import { WorkflowsModule } from './workflows/workflows.module';

@Module({
  imports: [
    EventBusModule,
    AmbientDatabaseModule,
    StreamingModule,
    ServicesModule,
    ListenersModule,
    WorkflowsModule,
    ScenariosModule,
    TriggersModule,
    ExecutionsModule,
    WellKnownModule,
    AmbientInvokeModule,
  ],
})
export class AmbientModule {}
