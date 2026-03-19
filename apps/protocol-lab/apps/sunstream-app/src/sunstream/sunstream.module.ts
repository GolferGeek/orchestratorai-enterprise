import { Module } from '@nestjs/common';
import { SunstreamController } from './sunstream.controller';
import { SunstreamService } from './sunstream.service';

@Module({
  controllers: [SunstreamController],
  providers: [SunstreamService],
  exports: [SunstreamService],
})
export class SunstreamModule {}
