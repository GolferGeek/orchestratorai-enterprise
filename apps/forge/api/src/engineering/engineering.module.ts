import { Module } from '@nestjs/common';
import { ObservabilityModule } from '@/observability/observability.module';
import { EngineeringController } from './engineering.controller';
import { EngineeringService } from './engineering.service';

@Module({
  imports: [ObservabilityModule],
  controllers: [EngineeringController],
  providers: [EngineeringService],
  exports: [EngineeringService],
})
export class EngineeringModule {}
