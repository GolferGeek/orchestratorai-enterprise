import { Module } from '@nestjs/common';
import { CrossExamSimulationService } from './cross-exam-simulation.service';

@Module({
  providers: [CrossExamSimulationService],
  exports: [CrossExamSimulationService],
})
export class CrossExamSimulationModule {}
