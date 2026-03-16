import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  TaskCompletionService,
  TaskCompletionParams,
} from '../task-completion.service';
import { TasksService } from '../../tasks/tasks.service';
import { DeliverablesService } from '../../deliverables/deliverables.service';

describe('TaskCompletionService', () => {
  let service: TaskCompletionService;
  let taskUpdateService: jest.Mocked<TasksService>;
  let deliverablesService: jest.Mocked<DeliverablesService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const baseParams: TaskCompletionParams = {
    orgSlug: 'test-org',
    agentSlug: 'test-agent',
    taskId: 'task-123',
    userId: 'user-123',
    conversationId: 'conv-123',
    status: 'success',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskCompletionService,
        {
          provide: TasksService,
          useValue: {
            updateTask: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: DeliverablesService,
          useValue: {
            create: jest.fn().mockResolvedValue({ id: 'deliverable-123' }),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TaskCompletionService>(TaskCompletionService);
    taskUpdateService = module.get(TasksService);
    deliverablesService = module.get(DeliverablesService);
    eventEmitter = module.get(EventEmitter2);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleCompletion', () => {
    describe('failed status', () => {
      it('should update task status to failed', async () => {
        const params: TaskCompletionParams = {
          ...baseParams,
          status: 'failed',
          error: 'Something went wrong',
        };

        const result = await service.handleCompletion(params);

        expect(taskUpdateService.updateTask).toHaveBeenCalledWith(
          'task-123',
          'user-123',
          expect.objectContaining({
            status: 'failed',
            progress: 0,
            progressMessage: 'Something went wrong',
          }),
        );
        expect(result.success).toBe(true);
        expect(result.message).toBe('Task marked as failed');
      });

      it('should use default error message when none provided', async () => {
        const params: TaskCompletionParams = {
          ...baseParams,
          status: 'failed',
        };

        await service.handleCompletion(params);

        expect(taskUpdateService.updateTask).toHaveBeenCalledWith(
          'task-123',
          'user-123',
          expect.objectContaining({
            progressMessage: 'Task failed',
          }),
        );
      });

      it('should emit failure event for task', async () => {
        const params: TaskCompletionParams = {
          ...baseParams,
          status: 'failed',
          error: 'Workflow error',
        };

        await service.handleCompletion(params);

        expect(eventEmitter.emit).toHaveBeenCalledWith(
          'task.completion.task-123',
          {
            error: 'Workflow error',
          },
        );
      });

      it('should not create deliverable on failure', async () => {
        const params: TaskCompletionParams = {
          ...baseParams,
          status: 'failed',
        };

        await service.handleCompletion(params);

        expect(deliverablesService.create).not.toHaveBeenCalled();
      });
    });

    describe('success status', () => {
      it('should update task status to completed', async () => {
        const params: TaskCompletionParams = {
          ...baseParams,
          status: 'success',
          results: { output: 'done' },
        };

        await service.handleCompletion(params);

        expect(taskUpdateService.updateTask).toHaveBeenCalledWith(
          'task-123',
          'user-123',
          expect.objectContaining({
            status: 'completed',
            progress: 100,
            progressMessage: 'Task completed successfully',
          }),
        );
      });

      it('should create deliverable when results and conversationId present', async () => {
        const params: TaskCompletionParams = {
          ...baseParams,
          status: 'success',
          results: { output: 'done' },
          conversationId: 'conv-123',
        };

        await service.handleCompletion(params);

        expect(deliverablesService.create).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Results from test-agent',
            conversationId: 'conv-123',
            agentName: 'test-agent',
          }),
          'user-123',
        );
      });

      it('should emit completion event with deliverable content', async () => {
        const params: TaskCompletionParams = {
          ...baseParams,
          status: 'success',
          results: { output: 'done' },
        };

        await service.handleCompletion(params);

        expect(eventEmitter.emit).toHaveBeenCalledWith(
          'task.completion.task-123',
          expect.objectContaining({ deliverable: expect.any(String) }),
        );
      });

      it('should not create deliverable when results are missing', async () => {
        const params: TaskCompletionParams = {
          ...baseParams,
          status: 'success',
          results: undefined,
        };

        await service.handleCompletion(params);

        expect(deliverablesService.create).not.toHaveBeenCalled();
      });

      it('should not create deliverable when conversationId is empty', async () => {
        const params: TaskCompletionParams = {
          ...baseParams,
          status: 'success',
          results: { data: 'some' },
          conversationId: '',
        };

        await service.handleCompletion(params);

        expect(deliverablesService.create).not.toHaveBeenCalled();
      });

      it('should return success true and correct message', async () => {
        const params: TaskCompletionParams = {
          ...baseParams,
          status: 'success',
          results: { data: 'value' },
        };

        const result = await service.handleCompletion(params);

        expect(result.success).toBe(true);
        expect(result.message).toBe('Task completed and deliverable created');
      });
    });
  });

  describe('formatCompletionResults', () => {
    it('should format marketing agent results as markdown with sections', () => {
      const results = {
        webPost: 'My blog post content',
        seoContent: 'SEO keywords',
        socialMedia: 'Tweet this!',
      };

      const formatted = service.formatCompletionResults(
        'marketing-swarm',
        results,
      );

      expect(formatted).toContain('# Marketing Content Package');
      expect(formatted).toContain('## Web Post');
      expect(formatted).toContain('My blog post content');
      expect(formatted).toContain('## SEO Content');
      expect(formatted).toContain('SEO keywords');
      expect(formatted).toContain('## Social Media');
      expect(formatted).toContain('Tweet this!');
    });

    it('should format non-string marketing results as JSON strings', () => {
      const results = {
        webPost: { title: 'Post', body: 'Content' },
      };

      const formatted = service.formatCompletionResults(
        'my-marketing-agent',
        results,
      );

      expect(formatted).toContain('## Web Post');
      expect(formatted).toContain('"title"');
    });

    it('should format generic results as JSON code block', () => {
      const results = { key: 'value', number: 42 };

      const formatted = service.formatCompletionResults(
        'generic-agent',
        results,
      );

      expect(formatted).toContain('```json');
      expect(formatted).toContain('"key": "value"');
      expect(formatted).toContain('```');
    });

    it('should handle missing sections in marketing results gracefully', () => {
      const results = { webPost: 'Only web post' };

      const formatted = service.formatCompletionResults(
        'marketing-bot',
        results,
      );

      expect(formatted).toContain('# Marketing Content Package');
      expect(formatted).toContain('## Web Post');
      expect(formatted).not.toContain('## SEO Content');
      expect(formatted).not.toContain('## Social Media');
    });

    it('should handle null results as JSON', () => {
      const formatted = service.formatCompletionResults('agent', null);

      expect(formatted).toContain('```json');
      expect(formatted).toContain('null');
    });
  });
});
