import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  AgentStreamChunkEvent,
  AgentStreamCompleteEvent,
  AgentStreamErrorEvent,
} from '@/agent-platform/services/agent-runtime-stream.service';
import { TaskProgressEvent } from '@/agent2agent/types/agent-conversations.types';

@Injectable()
export class TaskProgressService {
  private readonly logger = new Logger(TaskProgressService.name);

  @OnEvent('task.progress')
  handleTaskProgress(_event: TaskProgressEvent) {
    this.logger.debug('Task progress event received');
  }

  @OnEvent('agent.stream.chunk')
  handleAgentStreamChunk(event: AgentStreamChunkEvent) {
    this.logger.debug(`Stream chunk received for ${event.streamId}`);
  }

  @OnEvent('agent.stream.complete')
  handleAgentStreamComplete(event: AgentStreamCompleteEvent) {
    this.logger.debug(`Stream complete for ${event.streamId}`);
  }

  @OnEvent('agent.stream.error')
  handleAgentStreamError(event: AgentStreamErrorEvent) {
    this.logger.warn(`Stream error for ${event.streamId}: ${event.error}`);
  }

  broadcastWorkflowStepProgress(
    _taskId: string,
    _stepName: string,
    _stepIndex: number,
    _totalSteps: number,
    _status: string,
    _message?: string,
  ) {
    this.logger.debug(
      'Workflow step progress broadcast suppressed (SSE only).',
    );
  }

  broadcastTaskCompletion(_taskId: string, _status: string, _message?: string) {
    this.logger.debug('Task completion broadcast suppressed (SSE only).');
  }

  broadcastTaskCompletionWithResponse(
    _taskId: string,
    _status: string,
    _message?: string,
    _response?: string,
    _metadata?: unknown,
  ) {
    this.logger.debug(
      'Task completion (with response) broadcast suppressed (SSE only).',
    );
  }

  sendToTask(_taskId: string, _event: string, _data: unknown) {
    this.logger.debug('Direct task broadcast suppressed (SSE only).');
  }
}
