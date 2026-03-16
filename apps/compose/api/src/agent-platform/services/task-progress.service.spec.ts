import { Test, TestingModule } from '@nestjs/testing';
import { TaskProgressService } from './task-progress.service';
import { TaskProgressEvent } from '@/agent2agent/types/agent-conversations.types';
import {
  AgentStreamChunkEvent,
  AgentStreamCompleteEvent,
  AgentStreamErrorEvent,
} from '@/agent-platform/services/agent-runtime-stream.service';

describe('TaskProgressService', () => {
  let service: TaskProgressService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TaskProgressService],
    }).compile();

    service = module.get<TaskProgressService>(TaskProgressService);
  });

  describe('handleTaskProgress', () => {
    it('should handle task progress event', () => {
      const event: TaskProgressEvent = {
        taskId: 'task-1',
        status: 'running',
        progress: 50,
        message: 'Processing request',
      };

      expect(() => service.handleTaskProgress(event)).not.toThrow();
    });
  });

  describe('handleAgentStreamChunk', () => {
    it('should handle agent stream chunk event', () => {
      const event: AgentStreamChunkEvent = {
        streamId: 'stream-1',
        agentSlug: 'test-agent',
        mode: 'converse',
        chunk: { type: 'partial', content: 'test chunk' },
      };

      expect(() => service.handleAgentStreamChunk(event)).not.toThrow();
    });
  });

  describe('handleAgentStreamComplete', () => {
    it('should handle agent stream complete event', () => {
      const event: AgentStreamCompleteEvent = {
        streamId: 'stream-1',
        agentSlug: 'test-agent',
        mode: 'converse',
      };

      expect(() => service.handleAgentStreamComplete(event)).not.toThrow();
    });
  });

  describe('handleAgentStreamError', () => {
    it('should handle agent stream error event', () => {
      const event: AgentStreamErrorEvent = {
        streamId: 'stream-1',
        agentSlug: 'test-agent',
        mode: 'converse',
        error: 'Test error',
      };

      expect(() => service.handleAgentStreamError(event)).not.toThrow();
    });
  });

  describe('broadcastWorkflowStepProgress', () => {
    it('should suppress workflow step progress broadcast', () => {
      expect(() =>
        service.broadcastWorkflowStepProgress(
          'task-1',
          'step-1',
          1,
          5,
          'in_progress',
          'Processing step 1',
        ),
      ).not.toThrow();
    });
  });

  describe('broadcastTaskCompletion', () => {
    it('should suppress task completion broadcast', () => {
      expect(() =>
        service.broadcastTaskCompletion(
          'task-1',
          'completed',
          'Task finished successfully',
        ),
      ).not.toThrow();
    });
  });

  describe('broadcastTaskCompletionWithResponse', () => {
    it('should suppress task completion with response broadcast', () => {
      expect(() =>
        service.broadcastTaskCompletionWithResponse(
          'task-1',
          'completed',
          'Task finished',
          'Response data',
          { key: 'value' },
        ),
      ).not.toThrow();
    });
  });

  describe('sendToTask', () => {
    it('should suppress direct task broadcast', () => {
      expect(() =>
        service.sendToTask('task-1', 'custom-event', { data: 'test' }),
      ).not.toThrow();
    });
  });
});
