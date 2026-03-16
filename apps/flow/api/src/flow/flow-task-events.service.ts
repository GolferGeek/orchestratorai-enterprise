import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable, filter } from 'rxjs';

export interface TaskEvent {
  taskId: string;
  eventType: string;
  status: string;
  message: string | null;
  step: string | null;
  toolName: string | null;
  sessionId: string | null;
  sourceApp: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

const MAX_BUFFER_PER_TASK = 200;

@Injectable()
export class FlowTaskEventsService {
  private readonly logger = new Logger(FlowTaskEventsService.name);
  private readonly subject = new Subject<TaskEvent>();
  private readonly buffers = new Map<string, TaskEvent[]>();

  /**
   * Push an event for a task. Called by hooks (via controller) or by the task listener.
   */
  push(event: TaskEvent): void {
    // Buffer the event
    let buffer = this.buffers.get(event.taskId);
    if (!buffer) {
      buffer = [];
      this.buffers.set(event.taskId, buffer);
    }
    buffer.push(event);
    if (buffer.length > MAX_BUFFER_PER_TASK) {
      buffer.splice(0, buffer.length - MAX_BUFFER_PER_TASK);
    }

    // Emit to live subscribers
    this.subject.next(event);
  }

  /**
   * Get buffered events for a task (for SSE replay on connect).
   */
  getBufferedEvents(taskId: string): TaskEvent[] {
    return this.buffers.get(taskId) || [];
  }

  /**
   * Subscribe to live events for a specific task.
   */
  subscribe(taskId: string): Observable<TaskEvent> {
    return this.subject.pipe(filter((e) => e.taskId === taskId));
  }

  /**
   * Clean up buffer when a task is done.
   */
  clearTask(taskId: string): void {
    this.buffers.delete(taskId);
  }
}
