import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AssetsModule } from './assets/assets.module';
import { InvokeModule } from './invoke/invoke.module';
import { RunnersModule } from './runners/runners.module';
import { SpeechModule } from './speech/speech.module';

@Module({
  imports: [
    InvokeModule,
    RunnersModule,
    SpeechModule,
    AssetsModule,
  ],
  controllers: [AgentsController],
})
export class AgentsModule {}
