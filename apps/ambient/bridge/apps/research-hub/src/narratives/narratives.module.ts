import { Module } from '@nestjs/common';
import { NarrativesController } from './narratives.controller';
import { NarrativesService } from './narratives.service';

@Module({
  controllers: [NarrativesController],
  providers: [NarrativesService],
  exports: [NarrativesService],
})
export class NarrativesModule {}
