/**
 * Pulse Invoke Module
 *
 * Wires the PulseInvokeController and PulseDispatchService into the NestJS
 * module graph. All dispatch routing happens via remote A2A in the
 * TriggerExecutorService — the invoke endpoint is a thin A2A edge.
 */

import { Module } from '@nestjs/common';
import { PulseInvokeController } from './invoke.controller';
import { PulseDispatchService } from './pulse-dispatch.service';

@Module({
  imports: [],
  controllers: [PulseInvokeController],
  providers: [PulseDispatchService],
  exports: [PulseDispatchService],
})
export class InvokeModule {}
