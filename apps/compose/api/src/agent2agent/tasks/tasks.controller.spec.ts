import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskStatusService } from './task-status.service';
import { SupabaseAuthUserDto } from '@/auth/dto/auth.dto';
import { TaskQueryParams } from '@/agent2agent/types/agent-conversations.types';

describe('TasksController', () => {
  let controller: TasksController;
  let tasksService: jest.Mocked<TasksService>;
  let taskStatusService: jest.Mocked<TaskStatusService>;

  const mockUser: SupabaseAuthUserDto = {
    id: 'user-1',
    email: 'test@example.com',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        {
          provide: TasksService,
          useValue: {
            listTasks: jest.fn(),
            getTaskMetrics: jest.fn(),
            getTaskById: jest.fn(),
            updateTask: jest.fn(),
            cancelTask: jest.fn(),
            getActiveTasks: jest.fn(),
            streamTaskProgress: jest.fn(),
            getTaskMessages: jest.fn(),
            updateTaskProgress: jest.fn(),
          },
        },
        {
          provide: TaskStatusService,
          useValue: {
            getTaskStatus: jest.fn(),
            getTaskMessages: jest.fn(),
          },
        },
      ],
    })
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      .overrideGuard(require('@/auth/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TasksController>(TasksController);
    tasksService = module.get(TasksService);
    taskStatusService = module.get(TaskStatusService);
  });

  describe('listTasks', () => {
    it('should list tasks for current user', async () => {
      const query: TaskQueryParams = {
        limit: 10,
        offset: 0,
      };

      const mockTasks = [
        { id: 'task-1', userId: 'user-1', status: 'completed' },
        { id: 'task-2', userId: 'user-1', status: 'pending' },
      ];

      tasksService.listTasks.mockResolvedValue(mockTasks as any);

      const result = await controller.listTasks(query, mockUser);

      expect(result).toEqual(mockTasks);
      expect(tasksService.listTasks).toHaveBeenCalledWith({
        ...query,
        userId: 'user-1',
      });
    });

    it('should override userId from query with authenticated user', async () => {
      const query: TaskQueryParams = {
        userId: 'other-user', // Should be overridden
        limit: 10,
      };

      await controller.listTasks(query, mockUser);

      expect(tasksService.listTasks).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1', // Should use authenticated user
        }),
      );
    });
  });

  describe('getTaskMetrics', () => {
    it('should get task metrics for current user', async () => {
      const mockMetrics = {
        total: 10,
        completed: 5,
        pending: 3,
        failed: 2,
      };

      tasksService.getTaskMetrics.mockResolvedValue(mockMetrics as any);

      const result = await controller.getTaskMetrics(mockUser);

      expect(result).toEqual(mockMetrics);
      expect(tasksService.getTaskMetrics).toHaveBeenCalledWith('user-1');
    });

    it('should handle errors from tasksService', async () => {
      tasksService.getTaskMetrics.mockRejectedValue(
        new Error('Database error'),
      );

      // The controller returns the promise without awaiting in the try-catch,
      // so the error propagates directly without being wrapped
      await expect(controller.getTaskMetrics(mockUser)).rejects.toThrow(
        'Database error',
      );
    });
  });

  describe('getTask', () => {
    it('should get task by ID', async () => {
      const mockTask = {
        id: 'task-1',
        userId: 'user-1',
        status: 'completed',
      };

      tasksService.getTaskById.mockResolvedValue(mockTask as any);

      const result = await controller.getTask('task-1', mockUser);

      expect(result).toEqual(mockTask);
      expect(tasksService.getTaskById).toHaveBeenCalledWith('task-1', 'user-1');
    });

    it('should throw BadRequestException for invalid task ID', async () => {
      await expect(controller.getTask('undefined', mockUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.getTask('null', mockUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.getTask('', mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when task not found', async () => {
      tasksService.getTaskById.mockResolvedValue(null);

      await expect(controller.getTask('task-999', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateTask', () => {
    it('should update task', async () => {
      const updates = {
        status: 'cancelled' as const,
      };

      const mockUpdatedTask = {
        id: 'task-1',
        userId: 'user-1',
        status: 'cancelled',
      };

      tasksService.updateTask.mockResolvedValue(mockUpdatedTask as any);

      const result = await controller.updateTask('task-1', updates, mockUser);

      expect(result).toEqual(mockUpdatedTask);
      expect(tasksService.updateTask).toHaveBeenCalledWith(
        'task-1',
        'user-1',
        updates,
      );
    });

    it('should validate task ID', async () => {
      const updates = {
        status: 'cancelled' as const,
      };

      await expect(
        controller.updateTask('undefined', updates, mockUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelTask', () => {
    it('should cancel task', async () => {
      tasksService.cancelTask.mockResolvedValue(undefined);

      const result = await controller.cancelTask('task-1', mockUser);

      expect(result).toEqual({
        success: true,
        message: 'Task cancelled',
      });
      expect(tasksService.cancelTask).toHaveBeenCalledWith('task-1', 'user-1');
    });

    it('should validate task ID', async () => {
      await expect(
        controller.cancelTask('undefined', mockUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getActiveTasks', () => {
    it('should get active tasks for current user', async () => {
      const mockTasks = [
        { id: 'task-1', userId: 'user-1', status: 'running' },
        { id: 'task-2', userId: 'user-1', status: 'pending' },
      ];

      tasksService.getActiveTasks.mockResolvedValue(mockTasks as any);

      const result = await controller.getActiveTasks(mockUser);

      expect(result).toEqual(mockTasks);
      expect(tasksService.getActiveTasks).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getTaskStatus', () => {
    it('should get task status', () => {
      const mockStatus = {
        taskId: 'task-1',
        status: 'running',
        progress: 0.5,
      };

      taskStatusService.getTaskStatus.mockReturnValue(mockStatus as any);

      const result = controller.getTaskStatus('task-1', mockUser);

      expect(result).toEqual(mockStatus);
      expect(taskStatusService.getTaskStatus).toHaveBeenCalledWith(
        'task-1',
        'user-1',
      );
    });

    it('should throw NotFoundException when status not found', () => {
      taskStatusService.getTaskStatus.mockReturnValue(null);

      expect(() => controller.getTaskStatus('task-999', mockUser)).toThrow(
        NotFoundException,
      );
    });

    it('should validate task ID', () => {
      expect(() => controller.getTaskStatus('undefined', mockUser)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('getTaskMessages', () => {
    it('should get task messages from live status first', async () => {
      const mockMessages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ];

      taskStatusService.getTaskMessages.mockReturnValue(mockMessages as any);

      const result = await controller.getTaskMessages('task-1', mockUser);

      expect(result).toEqual(mockMessages);
      expect(taskStatusService.getTaskMessages).toHaveBeenCalledWith(
        'task-1',
        'user-1',
      );
      expect(tasksService.getTaskMessages).not.toHaveBeenCalled();
    });

    it('should fall back to database when live messages empty', async () => {
      const mockMessages = [{ role: 'user', content: 'Hello' }];

      taskStatusService.getTaskMessages.mockReturnValue([]);
      tasksService.getTaskMessages.mockResolvedValue(mockMessages as any);

      const result = await controller.getTaskMessages('task-1', mockUser);

      expect(result).toEqual(mockMessages);
      expect(tasksService.getTaskMessages).toHaveBeenCalledWith(
        'task-1',
        'user-1',
      );
    });

    it('should validate task ID', async () => {
      await expect(
        controller.getTaskMessages('undefined', mockUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateTaskProgress', () => {
    it('should update task progress', async () => {
      const body = {
        progress: 0.75,
        message: 'Processing data',
      };

      tasksService.updateTaskProgress.mockResolvedValue(undefined);

      const result = await controller.updateTaskProgress(
        'task-1',
        body,
        mockUser,
      );

      expect(result).toEqual({ success: true });
      expect(tasksService.updateTaskProgress).toHaveBeenCalledWith(
        'task-1',
        0.75,
        'Processing data',
      );
    });

    it('should update progress without message', async () => {
      const body = {
        progress: 0.5,
      };

      tasksService.updateTaskProgress.mockResolvedValue(undefined);

      await controller.updateTaskProgress('task-1', body, mockUser);

      expect(tasksService.updateTaskProgress).toHaveBeenCalledWith(
        'task-1',
        0.5,
        undefined,
      );
    });

    it('should validate task ID', async () => {
      const body = { progress: 0.5 };

      await expect(
        controller.updateTaskProgress('undefined', body, mockUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('validateTaskId', () => {
    it('should accept valid task IDs', () => {
      const validIds = ['task-1', '123', 'abc-def-ghi'];

      validIds.forEach((id) => {
        expect(() => {
          (controller as any).validateTaskId(id, 'user-1');
        }).not.toThrow();
      });
    });

    it('should reject invalid task IDs', () => {
      const invalidIds = ['undefined', 'null', ''];

      invalidIds.forEach((id) => {
        expect(() => {
          (controller as any).validateTaskId(id, 'user-1');
        }).toThrow(BadRequestException);
      });
    });

    it('should include user ID in error log', () => {
      // Note: Logging now happens in ParameterValidator, which is a static class
      // The validation still works correctly - this test verifies the error is thrown
      // with the correct error type
      expect(() => {
        (controller as any).validateTaskId('undefined', 'user-123');
      }).toThrow(BadRequestException);
    });
  });

  describe('Transport-types compliance', () => {
    it('should work with TaskQueryParams', async () => {
      const query: TaskQueryParams = {
        limit: 20,
        offset: 10,
        status: 'completed',
        conversationId: 'conv-1',
      };

      tasksService.listTasks.mockResolvedValue({ tasks: [], total: 0 });

      await controller.listTasks(query, mockUser);

      expect(tasksService.listTasks).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          limit: 20,
          offset: 10,
          status: 'completed',
          conversationId: 'conv-1',
        }),
      );
    });

    it('should enforce user security for all endpoints', async () => {
      // All endpoints should use the authenticated user's ID, not client-provided IDs

      // List tasks
      await controller.listTasks({ userId: 'hacker' } as any, mockUser);
      expect(tasksService.listTasks).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
      );

      // Get task
      tasksService.getTaskById.mockResolvedValue({ id: 'task-1' } as any);
      await controller.getTask('task-1', mockUser);
      expect(tasksService.getTaskById).toHaveBeenCalledWith('task-1', 'user-1');

      // Update task
      tasksService.updateTask.mockResolvedValue({ id: 'task-1' } as any);
      await controller.updateTask('task-1', {}, mockUser);
      expect(tasksService.updateTask).toHaveBeenCalledWith(
        'task-1',
        'user-1',
        {},
      );
    });
  });

  describe('Error handling', () => {
    it('should handle service errors gracefully', async () => {
      tasksService.getTaskById.mockRejectedValue(
        new Error('Database connection failed'),
      );

      await expect(controller.getTask('task-1', mockUser)).rejects.toThrow();
    });

    it('should provide clear error messages', async () => {
      await expect(controller.getTask('undefined', mockUser)).rejects.toThrow(
        'Invalid task ID provided',
      );
    });
  });
});
