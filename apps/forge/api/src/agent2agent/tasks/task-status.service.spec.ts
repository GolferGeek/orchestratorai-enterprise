import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TaskStatusService } from './task-status.service';
import type { TaskStatusState as _TaskStatusState } from './task-status.service';
import { DATABASE_SERVICE } from '@/database';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TaskMessageService } from './task-message.service';

describe('TaskStatusService', () => {
  let service: TaskStatusService;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let taskMessageService: jest.Mocked<TaskMessageService>;

  const mockSupabaseClient = {
    from: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskStatusService,
        {
          provide: DATABASE_SERVICE,
          useValue: mockSupabaseClient,
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
            on: jest.fn(),
          },
        },
        {
          provide: TaskMessageService,
          useValue: {
            createTaskMessage: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<TaskStatusService>(TaskStatusService);
    eventEmitter = module.get(EventEmitter2);
    taskMessageService = module.get(TaskMessageService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTask', () => {
    it('should create a new task with initial status', async () => {
      const taskId = 'task-123';
      const userId = 'user-123';
      const taskType = 'ephemeral';

      mockSupabaseClient.update.mockResolvedValue({
        error: null,
      });

      // Act
      await service.createTask(taskId, userId, taskType);

      // Assert
      const status = service.getTaskStatus(taskId, userId);
      expect(status).toBeDefined();
      expect(status?.taskId).toBe(taskId);
      expect(status?.userId).toBe(userId);
      expect(status?.status).toBe('pending');
      expect(status?.progress).toBe(0);
      expect(status?.taskType).toBe('ephemeral');
    });

    it('should persist task to database for long_running tasks', async () => {
      const taskId = 'task-long-123';
      const userId = 'user-123';
      const taskType = 'long_running';

      mockSupabaseClient.update.mockResolvedValue({
        error: null,
      });

      // Act
      await service.createTask(taskId, userId, taskType);

      // Assert
      expect(mockSupabaseClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'pending',
          progress: 0,
        }),
      );
    });

    it('should emit status change event', async () => {
      const taskId = 'task-123';
      const userId = 'user-123';

      mockSupabaseClient.update.mockResolvedValue({
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValue({
        data: {
          conversation_id: 'conv-123',
          metadata: { organizationSlug: 'test-org', agentSlug: 'test-agent' },
        },
        error: null,
      });

      // Act
      await service.createTask(taskId, userId);

      // Assert
      // Wait for async event emission
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'task.status_changed',
        expect.objectContaining({
          taskId: 'task-123',
          userId: 'user-123',
          status: 'pending',
        }),
      );
    });
  });

  describe('updateTaskStatus', () => {
    beforeEach(async () => {
      mockSupabaseClient.update.mockResolvedValue({
        error: null,
      });
      await service.createTask('task-123', 'user-123');
    });

    it('should update task status and progress', async () => {
      const taskId = 'task-123';
      const userId = 'user-123';

      mockSupabaseClient.update.mockResolvedValue({
        error: null,
      });

      // Act
      await service.updateTaskStatus(taskId, userId, {
        status: 'running',
        progress: 50,
      });

      // Assert
      const status = service.getTaskStatus(taskId, userId);
      expect(status?.status).toBe('running');
      expect(status?.progress).toBe(50);
    });

    it('should not allow unauthorized user to update task', async () => {
      const taskId = 'task-123';
      const unauthorizedUserId = 'user-999';

      // Act
      await service.updateTaskStatus(taskId, unauthorizedUserId, {
        status: 'running',
      });

      // Assert - should not update
      const statusForOwner = service.getTaskStatus(taskId, 'user-123');
      expect(statusForOwner?.status).toBe('pending'); // Still pending
    });

    it('should update database for persistent tasks', async () => {
      const taskId = 'task-persist-123';
      const userId = 'user-123';

      mockSupabaseClient.update.mockResolvedValue({
        error: null,
      });
      await service.createTask(taskId, userId, 'long_running');

      // Act
      await service.updateTaskStatus(taskId, userId, {
        status: 'completed',
        progress: 100,
        result: { data: 'completed' },
      });

      // Assert
      expect(mockSupabaseClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          progress: 100,
        }),
      );
    });

    it('should emit status change events', async () => {
      const taskId = 'task-123';
      const userId = 'user-123';

      mockSupabaseClient.update.mockResolvedValue({
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValue({
        data: { conversation_id: 'conv-123', metadata: {} },
        error: null,
      });

      // Act
      await service.updateTaskStatus(taskId, userId, {
        status: 'running',
      });

      // Assert
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'task.started',
        expect.objectContaining({
          taskId: 'task-123',
          userId: 'user-123',
        }),
      );
    });
  });

  describe('getTaskStatus', () => {
    it('should return task status for authorized user', async () => {
      const taskId = 'task-123';
      const userId = 'user-123';

      mockSupabaseClient.update.mockResolvedValue({
        error: null,
      });
      await service.createTask(taskId, userId);

      // Act
      const status = service.getTaskStatus(taskId, userId);

      // Assert
      expect(status).toBeDefined();
      expect(status?.taskId).toBe(taskId);
      expect(status?.userId).toBe(userId);
    });

    it('should return null for unauthorized user', async () => {
      const taskId = 'task-123';
      const ownerId = 'user-123';
      const unauthorizedUserId = 'user-999';

      mockSupabaseClient.update.mockResolvedValue({
        error: null,
      });
      await service.createTask(taskId, ownerId);

      // Act
      const status = service.getTaskStatus(taskId, unauthorizedUserId);

      // Assert
      expect(status).toBeNull();
    });

    it('should return null for non-existent task', async () => {
      const status = service.getTaskStatus('non-existent', 'user-123');

      // Assert
      expect(status).toBeNull();
    });
  });

  describe('completeTask', () => {
    it('should mark task as completed with result', async () => {
      const taskId = 'task-123';
      const userId = 'user-123';
      const result = { data: 'task completed successfully' };

      mockSupabaseClient.update.mockResolvedValue({
        error: null,
      });
      await service.createTask(taskId, userId);

      // Act
      await service.completeTask(taskId, userId, result);

      // Assert
      const status = service.getTaskStatus(taskId, userId);
      expect(status?.status).toBe('completed');
      expect(status?.progress).toBe(100);
      expect(status?.result).toEqual(result);
    });
  });

  describe('failTask', () => {
    it('should mark task as failed with error', async () => {
      const taskId = 'task-123';
      const userId = 'user-123';
      const error = 'Task execution failed';

      mockSupabaseClient.update.mockResolvedValue({
        error: null,
      });
      await service.createTask(taskId, userId);

      // Act
      await service.failTask(taskId, userId, error);

      // Assert
      const status = service.getTaskStatus(taskId, userId);
      expect(status?.status).toBe('failed');
      expect(status?.error).toBe(error);
    });
  });

  describe('updateProgress', () => {
    it('should update task progress with message', async () => {
      const taskId = 'task-123';
      const userId = 'user-123';
      const progress = 75;
      const message = 'Processing data...';

      mockSupabaseClient.update.mockResolvedValue({
        error: null,
      });
      await service.createTask(taskId, userId);
      taskMessageService.createTaskMessage.mockResolvedValue({
        id: 'msg-123',
        taskId,
        userId,
        content: message,
        messageType: 'progress',
        progressPercentage: progress,
        metadata: {},
        createdAt: new Date(),
      });

      // Act
      await service.updateProgress(taskId, userId, progress, message);

      // Assert
      const status = service.getTaskStatus(taskId, userId);
      expect(status?.progress).toBe(75);
      expect(status?.status).toBe('running');
      expect(taskMessageService.createTaskMessage).toHaveBeenCalledWith({
        taskId,
        userId,
        content: message,
        messageType: 'progress',
        progressPercentage: progress,
      });
    });
  });

  describe('getUserActiveTasks', () => {
    it('should return all active tasks for a user', async () => {
      const userId = 'user-123';

      mockSupabaseClient.update.mockResolvedValue({
        error: null,
      });

      await service.createTask('task-1', userId);
      await service.createTask('task-2', userId);
      await service.createTask('task-3', userId);

      // Update one to completed
      await service.updateTaskStatus('task-3', userId, {
        status: 'completed',
      });

      // Act
      const activeTasks = service.getUserActiveTasks(userId);

      // Assert
      expect(activeTasks).toHaveLength(2);
      expect(activeTasks.every((t) => t.status !== 'completed')).toBe(true);
    });

    it('should return empty array for user with no active tasks', async () => {
      const activeTasks = service.getUserActiveTasks('no-tasks-user');

      // Assert
      expect(activeTasks).toEqual([]);
    });
  });

  describe('addTaskMessage', () => {
    it('should add a message to task message cache', async () => {
      const taskId = 'task-123';
      const userId = 'user-123';

      mockSupabaseClient.update.mockResolvedValue({
        error: null,
      });
      await service.createTask(taskId, userId);

      // Act
      service.addTaskMessage(taskId, 'Test message', 'info');
      const messages = service.getTaskMessages(taskId, userId);

      // Assert
      expect(messages).toHaveLength(1);
      expect(messages[0]?.content).toBe('Test message');
      expect(messages[0]?.messageType).toBe('info');
    });

    it('should extract progress from metadata', async () => {
      const taskId = 'task-123';
      const userId = 'user-123';

      mockSupabaseClient.update.mockResolvedValue({
        error: null,
      });
      await service.createTask(taskId, userId);

      // Act
      service.addTaskMessage(taskId, 'Progress message', 'progress', {
        progress: 65,
      });
      const messages = service.getTaskMessages(taskId, userId);

      // Assert
      expect(messages[0]?.progressPercentage).toBe(65);
    });
  });

  describe('registerStreamSession', () => {
    it('should register a new stream session', () => {
      const params = {
        taskId: 'task-123',
        userId: 'user-123',
        agentSlug: 'test-agent',
        organizationSlug: 'test-org',
        streamId: 'stream-123',
        conversationId: 'conv-123',
      };

      // Act
      const sessionId = service.registerStreamSession(params);

      // Assert
      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
    });
  });

  describe('unregisterStreamSession', () => {
    it('should unregister a stream session', () => {
      const params = {
        taskId: 'task-123',
        userId: 'user-123',
        agentSlug: 'test-agent',
        organizationSlug: 'test-org',
      };

      const sessionId = service.registerStreamSession(params);

      // Act & Assert - should not throw
      expect(() =>
        service.unregisterStreamSession(sessionId, 'cleanup'),
      ).not.toThrow();
    });
  });

  describe('getStats', () => {
    it('should return service statistics', async () => {
      mockSupabaseClient.update.mockResolvedValue({
        error: null,
      });

      await service.createTask('task-1', 'user-1');
      await service.createTask('task-2', 'user-1');
      await service.createTask('task-3', 'user-2');

      // Act
      const stats = service.getStats();

      // Assert
      expect(stats.activeTaskCount).toBe(3);
      expect(stats.userTaskCounts['user-1']).toBe(2);
      expect(stats.userTaskCounts['user-2']).toBe(1);
    });
  });
});
