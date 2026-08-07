import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subject, filter } from 'rxjs';

export interface AmbientStreamEvent {
  orgSlug: string;
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
 * Events are pushed via RxJS Subject and exposed only to subscribers in the
 * same authorized organization.
 */
@Injectable()
export class StreamingService {
  private readonly logger = new Logger(StreamingService.name);
  private readonly events$ = new Subject<AmbientStreamEvent>();

  eventsForOrganization(orgSlug: string): Observable<AmbientStreamEvent> {
    return this.events$.pipe(filter((event) => event.orgSlug === orgSlug));
  }

  emit(event: Omit<AmbientStreamEvent, 'timestamp'>): void {
    const fullEvent: AmbientStreamEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };
    this.logger.debug(`Emitting event: ${event.type}`);
    this.events$.next(fullEvent);
  }

  emitWorkflowTriggered(
    orgSlug: string,
    workflowId: string,
    trigger: string,
    data?: Record<string, unknown>,
  ): void {
    this.emit({
      orgSlug,
      type: 'workflow.triggered',
      data: { workflowId, trigger, ...data },
    });
  }

  emitWorkflowCompleted(
    orgSlug: string,
    workflowId: string,
    outcome: Record<string, unknown>,
  ): void {
    this.emit({
      orgSlug,
      type: 'workflow.completed',
      data: { workflowId, outcome },
    });
  }

  emitWorkflowFailed(orgSlug: string, workflowId: string, error: string): void {
    this.emit({
      orgSlug,
      type: 'workflow.failed',
      data: { workflowId, error },
    });
  }

  emitListenerFired(
    orgSlug: string,
    listenerType: string,
    source: string,
    payload?: Record<string, unknown>,
  ): void {
    this.emit({
      orgSlug,
      type: 'listener.fired',
      data: { listenerType, source, ...payload },
    });
  }
}
