import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { AmbientEvent } from './ambient-event.types';

/**
 * Central event bus for all ambient event sources.
 * All adapters (db, file, cron, internal-a2a) emit to this bus.
 * The TriggerEvaluatorService subscribes to evaluate and route events.
 */
@Injectable()
export class AmbientEventBusService {
  private readonly logger = new Logger(AmbientEventBusService.name);
  private readonly subject = new Subject<AmbientEvent>();

  readonly events$: Observable<AmbientEvent> = this.subject.asObservable();

  emit(event: AmbientEvent): void {
    this.logger.log(
      `Event emitted: sourceType=${event.sourceType} triggerId=${event.triggerId ?? 'none'} triggerName=${event.triggerName ?? 'none'}`,
    );
    this.subject.next(event);
  }
}
