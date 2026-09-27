import { Module } from '@nestjs/common';
import { ObservabilityController } from './observability.controller';
import { ObservabilityService } from './observability.service';
import { ObservabilityStreamController } from './observability-stream.controller';

@Module({
  controllers: [ObservabilityController, ObservabilityStreamController],
  providers: [ObservabilityService],
})
export class ObservabilityModule {}
