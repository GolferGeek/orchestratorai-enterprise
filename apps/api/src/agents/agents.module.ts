import { Module } from '@nestjs/common';
import { AssetsModule } from './assets/assets.module';
import { CustomerServiceModule } from './customer-service/customer-service.module';
import { InvokeModule } from './invoke/invoke.module';
import { RunnersModule } from './runners/runners.module';
import { SpeechModule } from './speech/speech.module';
import { PipelinesModule } from './pipelines/pipelines.module';

@Module({
  imports: [
    InvokeModule,
    RunnersModule,
    SpeechModule,
    AssetsModule,
    CustomerServiceModule,
    PipelinesModule,
  ],
})
export class AgentsModule {}
