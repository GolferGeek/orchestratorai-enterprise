import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';

export interface PulseEvent {
  type: 'workflow.triggered' | 'workflow.completed' | 'workflow.failed' | 'listener.fired' | 'heartbeat';
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * SSE streaming service using platform-standard format.
 *
 * Platform standard (Content-Type: text/event-stream, Cache-Control: no-cache,
 * Connection: keep-alive, data: JSON\n\n).
 *
 * Events are pushed via RxJS Subject and broadcast to all SSE subscribers.
 */
@Injectable()
export class StreamingService {
  private readonly logger = new Logger(StreamingService.name);
  readonly events$ = new Subject<PulseEvent>();

  emit(event: Omit<PulseEvent, 'timestamp'>): void {
    const fullEvent: PulseEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };
    this.logger.debug(`Emitting event: ${event.type}`);
    this.events$.next(fullEvent);
  }

  emitWorkflowTriggered(workflowId: string, trigger: string, data?: Record<string, unknown>): void {
    this.emit({
      type: 'workflow.triggered',
      data: { workflowId, trigger, ...data },
    });
  }

  emitWorkflowCompleted(workflowId: string, outcome: Record<string, unknown>): void {
    this.emit({
      type: 'workflow.completed',
      data: { workflowId, outcome },
    });
  }

  emitWorkflowFailed(workflowId: string, error: string): void {
    this.emit({
      type: 'workflow.failed',
      data: { workflowId, error },
    });
  }

  emitListenerFired(listenerType: string, source: string, payload?: Record<string, unknown>): void {
    this.emit({
      type: 'listener.fired',
      data: { listenerType, source, ...payload },
    });
  }
}
