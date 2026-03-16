/**
 * Pulse Invoke Module
 *
 * Wires the PulseInvokeController and PulseDispatchService into the NestJS
 * module graph. Also registers the predictor and risk-runner processing
 * services as dispatch handlers so invoke requests can reach them.
 */

import { Module, OnModuleInit, Logger, forwardRef } from '@nestjs/common';
import { PulseInvokeController } from './invoke.controller';
import { PulseDispatchService } from './pulse-dispatch.service';
import { PredictorModule } from '../processing/predictor/predictor.module';
import { RiskRunnerModule } from '../processing/risk-runner/risk-runner.module';
import { PredictorService } from '../processing/predictor/predictor.service';
import { RiskRunnerService } from '../processing/risk-runner/risk-runner.service';
import type { ExecutionContext, InvokeData, InvokeOutput } from '@orchestrator-ai/transport-types';

@Module({
  imports: [
    forwardRef(() => PredictorModule),
    forwardRef(() => RiskRunnerModule),
  ],
  controllers: [PulseInvokeController],
  providers: [PulseDispatchService],
  exports: [PulseDispatchService],
})
export class InvokeModule implements OnModuleInit {
  private readonly logger = new Logger(InvokeModule.name);

  constructor(
    private readonly dispatch: PulseDispatchService,
    private readonly predictorService: PredictorService,
    private readonly riskRunnerService: RiskRunnerService,
  ) {}

  onModuleInit(): void {
    // Register predictor handler — agent slug: 'us-tech-stocks'
    this.dispatch.registerHandler(
      'us-tech-stocks',
      async (context: ExecutionContext, data: InvokeData, metadata?: Record<string, unknown>): Promise<InvokeOutput> => {
        const payload = data.content as Record<string, unknown> | undefined;
        const result = await this.predictorService.process({
          context,
          mode: (payload?.mode as string) || (metadata?.mode as string) || undefined,
          action: (payload?.action as string) || (metadata?.action as string) || undefined,
          payload: payload as Parameters<typeof this.predictorService.process>[0]['payload'],
        });
        return {
          content: result.response ?? { status: result.status },
          outputType: 'json',
          metadata: {
            status: result.status,
            duration: result.duration,
            error: result.error,
          },
        };
      },
    );

    // Register risk-runner handler — agent slug: 'investment-risk-agent'
    this.dispatch.registerHandler(
      'investment-risk-agent',
      async (context: ExecutionContext, data: InvokeData, metadata?: Record<string, unknown>): Promise<InvokeOutput> => {
        const payload = data.content as Record<string, unknown> | undefined;
        const result = await this.riskRunnerService.process({
          context,
          mode: (payload?.mode as string) || (metadata?.mode as string) || undefined,
          action: (payload?.action as string) || (metadata?.action as string) || undefined,
          payload: payload as Parameters<typeof this.riskRunnerService.process>[0]['payload'],
        });
        return {
          content: result.response ?? { status: result.status },
          outputType: 'json',
          metadata: {
            status: result.status,
            duration: result.duration,
            error: result.error,
          },
        };
      },
    );

    this.logger.log('Pulse dispatch handlers registered: us-tech-stocks, investment-risk-agent');
  }
}
