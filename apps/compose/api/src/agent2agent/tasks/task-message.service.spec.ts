import { Test, TestingModule } from '@nestjs/testing';
import { TaskMessageService } from './task-message.service';
import { DATABASE_SERVICE } from '@/database';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('TaskMessageService', () => {
  let service: TaskMessageService;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  let mockSupabaseClient: any;

  const createMockSupabaseClient = () => ({
    from: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    single: jest.fn(),
  });

  beforeEach(async () => {
    mockSupabaseClient = createMockSupabaseClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskMessageService,
        {
          provide: DATABASE_SERVICE,
          useValue: mockSupabaseClient,
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
            on: jest.fn(),
            off: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TaskMessageService>(TaskMessageService);
    eventEmitter = module.get(EventEmitter2);

    // Reset mocks but maintain chaining
    Object.keys(mockSupabaseClient).forEach((key) => {
      if (typeof mockSupabaseClient[key] === 'function' && key !== 'single') {
        mockSupabaseClient[key].mockReturnThis();
      }
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTaskMessage', () => {
    it('should create a task message and emit events', async () => {
      const dto = {
        taskId: 'task-123',
        userId: 'user-123',
        content: 'Task is in progress',
        messageType: 'progress' as const,
        progressPercentage: 50,
      };

      const taskMessageRow = {
        id: 'msg-123',
        task_id: 'task-123',
        user_id: 'user-123',
        content: 'Task is in progress',
        message_type: 'progress',
        progress_percentage: 50,
        metadata: {},
        created_at: new Date().toISOString(),
      };

      const taskRow = {
        conversation_id: 'conv-123',
        metadata: {
          organizationSlug: 'test-org',
          agentSlug: 'test-agent',
        },
      };

      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: taskMessageRow,
          error: null,
        })
        .mockResolvedValueOnce({
          data: taskRow,
          error: null,
        });

      // Act
      const result = await service.createTaskMessage(dto);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe('msg-123');
      expect(result.taskId).toBe('task-123');
      expect(result.messageType).toBe('progress');
      expect(result.progressPercentage).toBe(50);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'task.message',
        expect.objectContaining({
          taskId: 'task-123',
          userId: 'user-123',
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'task.progress',
        expect.objectContaining({
          taskId: 'task-123',
          progress: 50,
        }),
      );
    });

    it('should emit task.message event with conversation context', async () => {
      const dto = {
        taskId: 'task-123',
        userId: 'user-123',
        content: 'Status update',
        messageType: 'status' as const,
      };

      const taskMessageRow = {
        id: 'msg-123',
        task_id: 'task-123',
        user_id: 'user-123',
        content: 'Status update',
        message_type: 'status',
        metadata: {},
        created_at: new Date().toISOString(),
      };

      const taskRow = {
        conversation_id: 'conv-456',
        metadata: {
          organizationSlug: 'org-test',
          agentSlug: 'agent-test',
        },
      };

      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: taskMessageRow,
          error: null,
        })
        .mockResolvedValueOnce({
          data: taskRow,
          error: null,
        });

      // Act
      await service.createTaskMessage(dto);

      // Assert
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'task.message',
        expect.objectContaining({
          conversationId: 'conv-456',
          organizationSlug: 'org-test',
          agentSlug: 'agent-test',
        }),
      );
    });

    it('should handle database error', async () => {
      const dto = {
        taskId: 'task-123',
        userId: 'user-123',
        content: 'Test message',
        messageType: 'info' as const,
      };

      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      // Act & Assert
      await expect(service.createTaskMessage(dto)).rejects.toThrow(
        'Failed to create task message: Database error',
      );
    });

    it('should not emit progress event for non-progress messages', async () => {
      const dto = {
        taskId: 'task-123',
        userId: 'user-123',
        content: 'Error occurred',
        messageType: 'error' as const,
      };

      const taskMessageRow = {
        id: 'msg-123',
        task_id: 'task-123',
        user_id: 'user-123',
        content: 'Error occurred',
        message_type: 'error',
        metadata: {},
        created_at: new Date().toISOString(),
      };

      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: taskMessageRow,
          error: null,
        })
        .mockResolvedValueOnce({
          data: { conversation_id: 'conv-123', metadata: {} },
          error: null,
        });

      // Act
      await service.createTaskMessage(dto);

      // Assert
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'task.message',
        expect.anything(),
      );
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        'task.progress',
        expect.anything(),
      );
    });
  });

  describe('getTaskMessages', () => {
    it('should retrieve messages for a task', async () => {
      const taskId = 'task-123';
      const userId = 'user-123';

      const messagesRows = [
        {
          id: 'msg-1',
          task_id: 'task-123',
          user_id: 'user-123',
          content: 'First message',
          message_type: 'info',
          metadata: {},
          created_at: new Date().toISOString(),
        },
        {
          id: 'msg-2',
          task_id: 'task-123',
          user_id: 'user-123',
          content: 'Second message',
          message_type: 'progress',
          progress_percentage: 50,
          metadata: {},
          created_at: new Date().toISOString(),
        },
      ];

      mockSupabaseClient.range.mockResolvedValue({
        data: messagesRows,
        error: null,
        count: 2,
      });

      // Act
      const result = await service.getTaskMessages(taskId, userId);

      // Assert
      expect(result.messages).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.messages[0]?.id).toBe('msg-1');
      expect(result.messages[1]?.id).toBe('msg-2');
    });

    it('should filter by message type', async () => {
      const taskId = 'task-123';
      const userId = 'user-123';
      const params = { messageType: 'error' };

      const messagesRows = [
        {
          id: 'msg-error',
          task_id: 'task-123',
          user_id: 'user-123',
          content: 'Error message',
          message_type: 'error',
          metadata: {},
          created_at: new Date().toISOString(),
        },
      ];

      mockSupabaseClient.range.mockResolvedValue({
        data: messagesRows,
        error: null,
        count: 1,
      });

      // Act
      const result = await service.getTaskMessages(taskId, userId, params);

      // Assert
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.messageType).toBe('error');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        'message_type',
        'error',
      );
    });

    it('should handle pagination', async () => {
      const taskId = 'task-123';
      const userId = 'user-123';
      const params = { limit: 10, offset: 20 };

      mockSupabaseClient.range.mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      // Act
      await service.getTaskMessages(taskId, userId, params);

      // Assert
      expect(mockSupabaseClient.range).toHaveBeenCalledWith(20, 29);
    });
  });

  describe('getRecentMessages', () => {
    it('should retrieve recent messages for a user', async () => {
      const userId = 'user-123';

      const messagesRows = [
        {
          id: 'msg-1',
          task_id: 'task-1',
          user_id: 'user-123',
          content: 'Recent message 1',
          message_type: 'info',
          metadata: {},
          created_at: new Date().toISOString(),
        },
        {
          id: 'msg-2',
          task_id: 'task-2',
          user_id: 'user-123',
          content: 'Recent message 2',
          message_type: 'progress',
          metadata: {},
          created_at: new Date().toISOString(),
        },
      ];

      mockSupabaseClient.range.mockResolvedValue({
        data: messagesRows,
        error: null,
        count: 2,
      });

      // Act
      const result = await service.getRecentMessages(userId);

      // Assert
      expect(result.messages).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });

  describe('deleteTaskMessages', () => {
    it('should delete all messages for a task', async () => {
      const taskId = 'task-123';
      const userId = 'user-123';

      // Create a fresh mock chain for delete operation with 2 .eq() calls
      const mockDeleteChain: any = {};
      // First .eq() returns chain, second returns result
      mockDeleteChain.eq = jest
        .fn()
        .mockReturnValueOnce(mockDeleteChain) // First eq() - returns chain
        .mockResolvedValueOnce({ error: null }); // Second eq() - returns result

      mockSupabaseClient.from.mockReturnValue({
        delete: jest.fn().mockReturnValue(mockDeleteChain),
      });

      // Act
      await service.deleteTaskMessages(taskId, userId);

      // Assert
      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        null,
        'task_messages',
      );
    });

    it('should handle deletion errors', async () => {
      const taskId = 'task-123';
      const userId = 'user-123';

      // Create a fresh mock chain for delete operation with 2 .eq() calls
      const mockDeleteChain: any = {};
      // First .eq() returns chain, second returns result with error
      mockDeleteChain.eq = jest
        .fn()
        .mockReturnValueOnce(mockDeleteChain) // First eq() - returns chain
        .mockResolvedValueOnce({
          error: { message: 'Deletion failed' },
        }); // Second eq() - returns error result

      mockSupabaseClient.from.mockReturnValue({
        delete: jest.fn().mockReturnValue(mockDeleteChain),
      });

      // Act & Assert
      await expect(service.deleteTaskMessages(taskId, userId)).rejects.toThrow(
        'Failed to delete task messages: Deletion failed',
      );
    });
  });

  describe('getTaskMessageStats', () => {
    it('should return message statistics', async () => {
      const taskId = 'task-123';
      const userId = 'user-123';

      const messagesRows = [
        {
          id: 'msg-1',
          task_id: 'task-123',
          user_id: 'user-123',
          content: 'Info message',
          message_type: 'info',
          metadata: {},
          created_at: new Date().toISOString(),
        },
        {
          id: 'msg-2',
          task_id: 'task-123',
          user_id: 'user-123',
          content: 'Progress message',
          message_type: 'progress',
          metadata: {},
          created_at: new Date().toISOString(),
        },
        {
          id: 'msg-3',
          task_id: 'task-123',
          user_id: 'user-123',
          content: 'Error message',
          message_type: 'error',
          metadata: {},
          created_at: new Date().toISOString(),
        },
      ];

      mockSupabaseClient.order.mockResolvedValue({
        data: messagesRows,
        error: null,
      });

      // Act
      const result = await service.getTaskMessageStats(taskId, userId);

      // Assert
      expect(result.total).toBe(3);
      expect(result.byType).toEqual({
        info: 1,
        progress: 1,
        error: 1,
      });
      expect(result.progressMessages).toBe(1);
      expect(result.errorMessages).toBe(1);
      expect(result.lastMessage?.id).toBe('msg-1'); // Most recent
    });
  });
});
