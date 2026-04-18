import { Module } from '@nestjs/common';
import { MonteCarloTrialSimulatorService } from './monte-carlo-trial-simulator.service';

@Module({
  providers: [MonteCarloTrialSimulatorService],
  exports: [MonteCarloTrialSimulatorService],
})
export class MonteCarloTrialSimulatorModule {}
