import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SpeechController } from './speech.controller';
import { SpeechService } from './speech.service';

@Module({
  imports: [HttpModule],
  controllers: [SpeechController],
  providers: [SpeechService],
  exports: [SpeechService],
})
export class SpeechModule {}
