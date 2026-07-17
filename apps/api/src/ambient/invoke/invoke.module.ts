/**
 * Ambient Invoke Module
 *
 * Wires the AmbientInvokeController and AmbientDispatchService into the NestJS
 * module graph. All dispatch routing happens via remote A2A in the
 * TriggerExecutorService — the invoke endpoint is a thin A2A edge.
 */

import { Module } from '@nestjs/common';
import { AmbientInvokeController } from './invoke.controller';
import { AmbientDispatchService } from './ambient-dispatch.service';

@Module({
  imports: [],
  controllers: [AmbientInvokeController],
  providers: [AmbientDispatchService],
  exports: [AmbientDispatchService],
})
export class InvokeModule {}
