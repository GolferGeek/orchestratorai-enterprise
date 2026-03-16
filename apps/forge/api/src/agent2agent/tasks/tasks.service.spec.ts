import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TasksService } from './tasks.service';
import { DATABASE_SERVICE } from '@/database';
import { AgentConversationsService } from '../conversations/agent-conversations.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TaskMessageService } from './task-message.service';
import { TaskStatusService } from './task-status.service';

describe('TasksService', () => {
  let service: TasksService;
  let agentConversationsService: jest.Mocked<AgentConversationsService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let taskMessageService: jest.Mocked<TaskMessageService>;
  let taskStatusService: jest.Mocked<TaskStatusService>;

  const mockSupabaseClient = {
    from: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    single: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        {
          provide: DATABASE_SERVICE,
          useValue: mockSupabaseClient,
        },
        {
          provide: AgentConversationsService,
          useValue: {
            getOrCreateConversation: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
            on: jest.fn(),
            off: jest.fn(),
          },
        },
        {
          provide: TaskMessageService,
          useValue: {
            createTaskMessage: jest.fn(),
            getTaskMessages: jest.fn(),
          },
        },
        {
          provide: TaskStatusService,
          useValue: {
            createTask: jest.fn(),
            updateTaskStatus: jest.fn(),
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

    service = module.get<TasksService>(TasksService);
    agentConversationsService = module.get(AgentConversationsService);
    eventEmitter = module.get(EventEmitter2);
    taskMessageService = module.get(TaskMessageService);
    taskStatusService = module.get(TaskStatusService);

    // Reset all mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTask', () => {
    it('should create a new task with conversation', async () => {
      const userId = 'user-123';
      const agentName = 'test-agent';
      const agentType = 'context';
      const dto = {
        conversationId: 'conv-123',
        method: 'test-method',
        prompt: 'Test prompt',
        params: { key: 'value' },
      };

      const conversation = {
        id: 'conv-123',
        userId: 'user-123',
        agentName: 'test-agent',
        agentType: 'context',
        startedAt: new Date(),
        lastActiveAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const createdTaskRow = {
        id: 'task-123',
        conversation_id: 'conv-123',
        user_id: 'user-123',
        method: 'test-method',
        prompt: 'Test prompt',
        params: { key: 'value' },
        status: 'pending',
        progress: 0,
        timeout_seconds: 120,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      agentConversationsService.getOrCreateConversation.mockResolvedValue(
        conversation,
      );
      mockSupabaseClient.single.mockResolvedValue({
        data: createdTaskRow,
        error: null,
      });

      // Act
      const result = await service.createTask(
        userId,
        agentName,
        agentType,
        dto,
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe('task-123');
      expect(result.agentConversationId).toBe('conv-123');
      expect(result.userId).toBe('user-123');
      expect(result.status).toBe('pending');
      expect(
        agentConversationsService.getOrCreateConversation,
      ).toHaveBeenCalledWith(userId, agentName, agentType, 'conv-123');
      expect(taskStatusService.createTask).toHaveBeenCalledWith(
        'task-123',
        userId,
        expect.any(String),
        expect.objectContaining({
          status: 'pending',
          progress: 0,
        }),
      );
      expect(taskMessageService.createTaskMessage).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'task.created',
        expect.objectContaining({
          taskId: 'task-123',
          conversationId: 'conv-123',
        }),
      );
    });

    it('should create conversation if not provided', async () => {
      const userId = 'user-123';
      const agentName = 'test-agent';
      const agentType = 'context';
      const dto = {
        method: 'test-method',
        prompt: 'Test prompt',
      };

      const createdConversation = {
        id: 'conv-new-123',
        userId: 'user-123',
        agentName: 'test-agent',
        agentType: 'context',
        startedAt: new Date(),
        lastActiveAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const createdTaskRow = {
        id: 'task-123',
        conversation_id: 'conv-new-123',
        user_id: 'user-123',
        method: 'test-method',
        prompt: 'Test prompt',
        params: {},
        status: 'pending',
        progress: 0,
        timeout_seconds: 120,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      agentConversationsService.getOrCreateConversation.mockResolvedValue(
        createdConversation,
      );
      mockSupabaseClient.single.mockResolvedValue({
        data: createdTaskRow,
        error: null,
      });

      // Act
      const result = await service.createTask(
        userId,
        agentName,
        agentType,
        dto,
      );

      // Assert
      expect(result.agentConversationId).toBe('conv-new-123');
      expect(
        agentConversationsService.getOrCreateConversation,
      ).toHaveBeenCalled();
    });

    it('should handle database error', async () => {
      const userId = 'user-123';
      const agentName = 'test-agent';
      const agentType = 'context';
      const dto = {
        method: 'test-method',
        prompt: 'Test prompt',
      };

      agentConversationsService.getOrCreateConversation.mockResolvedValue({
        id: 'conv-123',
        userId: 'user-123',
        agentName: 'test-agent',
        agentType: 'context',
        startedAt: new Date(),
        lastActiveAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      // Act & Assert
      await expect(
        service.createTask(userId, agentName, agentType, dto),
      ).rejects.toThrow('Failed to create task: Database error');
    });

    it('should retry on duplicate key error', async () => {
      const userId = 'user-123';
      const agentName = 'test-agent';
      const agentType = 'context';
      const dto = {
        taskId: 'existing-task-id',
        method: 'test-method',
        prompt: 'Test prompt',
      };

      const createdTaskRow = {
        id: 'task-new-123',
        conversation_id: 'conv-123',
        user_id: 'user-123',
        method: 'test-method',
        prompt: 'Test prompt',
        params: {},
        status: 'pending',
        progress: 0,
        timeout_seconds: 120,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      agentConversationsService.getOrCreateConversation.mockResolvedValue({
        id: 'conv-123',
        userId: 'user-123',
        agentName: 'test-agent',
        agentType: 'context',
        startedAt: new Date(),
        lastActiveAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // First call fails with duplicate key, second succeeds
      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: null,
          error: { code: '23505', message: 'Duplicate key' },
        })
        .mockResolvedValueOnce({
          data: createdTaskRow,
          error: null,
        });

      // Act
      const result = await service.createTask(
        userId,
        agentName,
        agentType,
        dto,
      );

      // Assert
      expect(result.id).toBe('task-new-123');
      expect(mockSupabaseClient.insert).toHaveBeenCalledTimes(2);
    });
  });

  describe('getTaskById', () => {
    it('should return task by ID', async () => {
      const taskId = 'task-123';
      const userId = 'user-123';

      const taskRow = {
        id: 'task-123',
        conversation_id: 'conv-123',
        user_id: 'user-123',
        method: 'test-method',
        prompt: 'Test prompt',
        params: {},
        status: 'completed',
        progress: 100,
        response: 'Task result',
        timeout_seconds: 120,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockSupabaseClient.single.mockResolvedValue({
        data: taskRow,
        error: null,
      });

      // Act
      const result = await service.getTaskById(taskId, userId);

      // Assert
      expect(result).toBeDefined();
      expect(result?.id).toBe('task-123');
      expect(result?.status).toBe('completed');
      expect(result?.response).toBe('Task result');
    });

    it('should return null if task not found', async () => {
      const taskId = 'non-existent';
      const userId = 'user-123';

      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });

      // Act
      const result = await service.getTaskById(taskId, userId);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('updateTask', () => {
    it('should update task status and progress', async () => {
      const taskId = 'task-123';
      const userId = 'user-123';
      const updates = {
        status: 'running' as const,
        progress: 50,
      };

      const updatedTaskRow = {
        id: 'task-123',
        conversation_id: 'conv-123',
        user_id: 'user-123',
        method: 'test-method',
        prompt: 'Test prompt',
        params: {},
        status: 'running',
        progress: 50,
        started_at: new Date().toISOString(),
        timeout_seconds: 120,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockSupabaseClient.single.mockResolvedValue({
        data: updatedTaskRow,
        error: null,
      });

      // Act
      const result = await service.updateTask(taskId, userId, updates);

      // Assert
      expect(result.status).toBe('running');
      expect(result.progress).toBe(50);
      expect(taskStatusService.updateTaskStatus).toHaveBeenCalledWith(
        taskId,
        userId,
        expect.objectContaining({
          status: 'running',
          progress: 50,
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

    it('should set started_at when status changes to running', async () => {
      const taskId = 'task-123';
      const userId = 'user-123';
      const updates = {
        status: 'running' as const,
      };

      const updatedTaskRow = {
        id: 'task-123',
        conversation_id: 'conv-123',
        user_id: 'user-123',
        method: 'test-method',
        prompt: 'Test prompt',
        params: {},
        status: 'running',
        progress: 0,
        started_at: new Date().toISOString(),
        timeout_seconds: 120,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockSupabaseClient.single.mockResolvedValue({
        data: updatedTaskRow,
        error: null,
      });

      // Act
      const result = await service.updateTask(taskId, userId, updates);

      // Assert
      expect(result.startedAt).toBeDefined();
    });

    it('should set completed_at when task completes', async () => {
      const taskId = 'task-123';
      const userId = 'user-123';
      const updates = {
        status: 'completed' as const,
        progress: 100,
        response: 'Task completed',
      };

      const updatedTaskRow = {
        id: 'task-123',
        conversation_id: 'conv-123',
        user_id: 'user-123',
        method: 'test-method',
        prompt: 'Test prompt',
        params: {},
        response: 'Task completed',
        status: 'completed',
        progress: 100,
        completed_at: new Date().toISOString(),
        timeout_seconds: 120,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockSupabaseClient.single.mockResolvedValue({
        data: updatedTaskRow,
        error: null,
      });

      // Act
      const result = await service.updateTask(taskId, userId, updates);

      // Assert
      expect(result.completedAt).toBeDefined();
      expect(result.response).toBe('Task completed');
    });
  });

  describe('listTasks', () => {
    it('should list tasks with filters', async () => {
      const params = {
        userId: 'user-123',
        status: 'completed' as const,
        limit: 10,
        offset: 0,
      };

      const tasksRows = [
        {
          id: 'task-1',
          conversation_id: 'conv-123',
          user_id: 'user-123',
          method: 'method-1',
          prompt: 'Prompt 1',
          params: {},
          status: 'completed',
          progress: 100,
          timeout_seconds: 120,
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'task-2',
          conversation_id: 'conv-123',
          user_id: 'user-123',
          method: 'method-2',
          prompt: 'Prompt 2',
          params: {},
          status: 'completed',
          progress: 100,
          timeout_seconds: 120,
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      mockSupabaseClient.range.mockResolvedValue({
        data: tasksRows,
        error: null,
        count: 2,
      });

      // Act
      const result = await service.listTasks(params);

      // Assert
      expect(result.tasks).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.tasks[0]?.id).toBe('task-1');
      expect(result.tasks[1]?.id).toBe('task-2');
    });
  });

  describe('cancelTask', () => {
    it('should cancel a pending task', async () => {
      const taskId = 'task-123';
      const userId = 'user-123';

      const cancelledTaskRow = {
        id: 'task-123',
        conversation_id: 'conv-123',
        user_id: 'user-123',
        method: 'test-method',
        prompt: 'Test prompt',
        params: {},
        status: 'cancelled',
        progress: 0,
        timeout_seconds: 120,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockSupabaseClient.single.mockResolvedValue({
        data: cancelledTaskRow,
        error: null,
      });

      // Act
      await service.cancelTask(taskId, userId);

      // Assert
      expect(mockSupabaseClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'cancelled',
        }),
      );
    });
  });

  describe('getActiveTasks', () => {
    it('should return only pending and running tasks', async () => {
      const userId = 'user-123';

      const tasksRows = [
        {
          id: 'task-1',
          conversation_id: 'conv-123',
          user_id: 'user-123',
          method: 'method-1',
          prompt: 'Prompt 1',
          params: {},
          status: 'pending',
          progress: 0,
          timeout_seconds: 120,
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'task-2',
          conversation_id: 'conv-123',
          user_id: 'user-123',
          method: 'method-2',
          prompt: 'Prompt 2',
          params: {},
          status: 'running',
          progress: 50,
          timeout_seconds: 120,
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      mockSupabaseClient.order.mockResolvedValue({
        data: tasksRows,
        error: null,
      });

      // Act
      const result = await service.getActiveTasks(userId);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]?.status).toBe('pending');
      expect(result[1]?.status).toBe('running');
    });
  });

  describe('HITL Pending Methods', () => {
    it('should find pending HITL tasks', async () => {
      const userId = 'user-123';

      const hitlTasksRows = [
        {
          id: 'task-hitl-1',
          conversation_id: 'conv-123',
          user_id: 'user-123',
          method: 'method-1',
          prompt: 'Prompt 1',
          params: {},
          status: 'pending',
          progress: 90,
          hitl_pending: true,
          hitl_pending_since: new Date().toISOString(),
          timeout_seconds: 120,
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      mockSupabaseClient.order.mockResolvedValue({
        data: hitlTasksRows,
        error: null,
      });

      // Act
      const result = await service.findPendingHitl(userId);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]?.hitl_pending).toBe(true);
    });

    it('should update HITL pending status', async () => {
      const taskId = 'task-123';
      const pending = true;

      // Create a fresh mock chain for update operation
      const mockUpdateChain = {
        eq: jest.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };
      mockSupabaseClient.from.mockReturnValue({
        update: jest.fn().mockReturnValue(mockUpdateChain),
      });

      // Act
      await service.updateHitlPending(taskId, pending);

      // Assert
      expect(mockSupabaseClient.from).toHaveBeenCalledWith(null, 'tasks');
    });

    it('should clear HITL pending status', async () => {
      const taskId = 'task-123';
      const pending = false;

      // Create a fresh mock chain for update operation
      const mockUpdateChain = {
        eq: jest.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };
      mockSupabaseClient.from.mockReturnValue({
        update: jest.fn().mockReturnValue(mockUpdateChain),
      });

      // Act
      await service.updateHitlPending(taskId, pending);

      // Assert
      expect(mockSupabaseClient.from).toHaveBeenCalledWith(null, 'tasks');
    });
  });
});
