import { Test, TestingModule } from '@nestjs/testing';
import { HumanLoopService } from './human-loop.service';
import { DATABASE_SERVICE } from '@/database';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('HumanLoopService', () => {
  let service: HumanLoopService;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  let mockSupabaseClient: any;

  const createMockSupabaseClient = () => ({
    from: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    single: jest.fn(),
  });

  beforeEach(async () => {
    mockSupabaseClient = createMockSupabaseClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HumanLoopService,
        {
          provide: DATABASE_SERVICE,
          useValue: mockSupabaseClient,
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<HumanLoopService>(HumanLoopService);
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

  describe('requestHumanInput', () => {
    it('should create a human input request and emit event', async () => {
      const taskId = 'task-123';
      const userId = 'user-123';
      const prompt = 'Please confirm: Delete all data?';
      const requestType = 'confirmation';
      const timeoutSeconds = 300;

      const humanInputRow = {
        id: 'input-123',
        task_id: taskId,
        user_id: userId,
        request_type: requestType,
        prompt,
        options: null,
        status: 'pending',
        timeout_at: new Date(Date.now() + timeoutSeconds * 1000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockSupabaseClient.single.mockResolvedValue({
        data: humanInputRow,
        error: null,
      });

      // Act
      const result = await service.requestHumanInput(
        taskId,
        userId,
        prompt,
        requestType,
        undefined,
        timeoutSeconds,
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe('input-123');
      expect(result.taskId).toBe(taskId);
      expect(result.prompt).toBe(prompt);
      expect(result.status).toBe('pending');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'human_input.required',
        expect.objectContaining({
          taskId,
          userId,
          inputId: 'input-123',
          prompt,
          requestType,
        }),
      );
    });

    it('should handle choice type requests with options', async () => {
      const taskId = 'task-123';
      const userId = 'user-123';
      const prompt = 'Select deployment environment:';
      const requestType = 'choice';
      const options = ['development', 'staging', 'production'];

      const humanInputRow = {
        id: 'input-123',
        task_id: taskId,
        user_id: userId,
        request_type: requestType,
        prompt,
        options: JSON.stringify(options),
        status: 'pending',
        timeout_at: new Date(Date.now() + 300 * 1000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockSupabaseClient.single.mockResolvedValue({
        data: humanInputRow,
        error: null,
      });

      // Act
      const result = await service.requestHumanInput(
        taskId,
        userId,
        prompt,
        requestType,
        options,
      );

      // Assert
      expect(result.requestType).toBe('choice');
      expect(result.options).toEqual(options);
    });

    it('should handle database errors', async () => {
      const taskId = 'task-123';
      const userId = 'user-123';
      const prompt = 'Test prompt';

      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      // Act & Assert
      await expect(
        service.requestHumanInput(taskId, userId, prompt),
      ).rejects.toThrow('Failed to create human input: Database error');
    });
  });

  describe('submitHumanResponse', () => {
    it('should submit response and emit events', async () => {
      const inputId = 'input-123';
      const userId = 'user-123';
      const response = {
        response: 'production',
        metadata: { confidence: 'high' },
      };

      const updatedInputRow = {
        id: inputId,
        task_id: 'task-123',
        user_id: userId,
        request_type: 'choice',
        prompt: 'Select environment',
        user_response: 'production',
        response_metadata: { confidence: 'high' },
        status: 'completed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockSupabaseClient.single.mockResolvedValue({
        data: updatedInputRow,
        error: null,
      });

      // Act
      const result = await service.submitHumanResponse(
        inputId,
        userId,
        response,
      );

      // Assert
      expect(result.status).toBe('completed');
      expect(result.userResponse).toBe('production');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'human_input.response',
        expect.objectContaining({
          inputId,
          userId,
          response: 'production',
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'task.resumed',
        expect.objectContaining({
          taskId: 'task-123',
          userId,
        }),
      );
    });

    it('should handle already completed inputs', async () => {
      const inputId = 'input-123';
      const userId = 'user-123';
      const response = {
        response: 'yes',
      };

      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'No rows updated' },
      });

      // Act & Assert
      await expect(
        service.submitHumanResponse(inputId, userId, response),
      ).rejects.toThrow('Failed to update human input: No rows updated');
    });
  });

  describe('waitForHumanResponse', () => {
    it('should resolve when response is submitted', async () => {
      const inputId = 'input-123';
      const timeoutMs = 5000;

      const pendingInput = {
        id: inputId,
        task_id: 'task-123',
        user_id: 'user-123',
        request_type: 'input',
        prompt: 'Enter value',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const completedInput = {
        ...pendingInput,
        status: 'completed',
        user_response: 'user entered value',
      };

      // First call returns pending, second returns completed
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: pendingInput,
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: completedInput,
        error: null,
      });

      // Act
      const promise = service.waitForHumanResponse(inputId, timeoutMs);

      // Simulate response after short delay
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const result = await promise;

      // Assert
      expect(result.status).toBe('completed');
      expect(result.userResponse).toBe('user entered value');
    }, 10000); // Increase test timeout

    it('should timeout if no response received', async () => {
      const inputId = 'input-timeout';
      const timeoutMs = 1000;

      const pendingInput = {
        id: inputId,
        task_id: 'task-123',
        user_id: 'user-123',
        request_type: 'input',
        prompt: 'Enter value',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const timeoutInput = {
        ...pendingInput,
        status: 'timeout',
      };

      // Always return pending, then timeout
      mockSupabaseClient.single.mockResolvedValue({
        data: pendingInput,
        error: null,
      });

      // Mock timeout handling
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: timeoutInput,
        error: null,
      });

      // Act
      const promise = service.waitForHumanResponse(inputId, timeoutMs);

      const result = await promise;

      // Assert
      expect(result.status).toBe('timeout');
    }, 5000);
  });

  describe('getHumanInputById', () => {
    it('should retrieve human input by ID', async () => {
      const inputId = 'input-123';

      const inputRow = {
        id: inputId,
        task_id: 'task-123',
        user_id: 'user-123',
        request_type: 'approval',
        prompt: 'Approve deployment?',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockSupabaseClient.single.mockResolvedValue({
        data: inputRow,
        error: null,
      });

      // Act
      const result = await service.getHumanInputById(inputId);

      // Assert
      expect(result).toBeDefined();
      expect(result?.id).toBe(inputId);
      expect(result?.requestType).toBe('approval');
    });

    it('should return null if input not found', async () => {
      const inputId = 'non-existent';

      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });

      // Act
      const result = await service.getHumanInputById(inputId);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getPendingInputsForTask', () => {
    it('should retrieve pending inputs for a task', async () => {
      const taskId = 'task-123';
      const userId = 'user-123';

      const pendingInputsRows = [
        {
          id: 'input-1',
          task_id: taskId,
          user_id: userId,
          request_type: 'confirmation',
          prompt: 'Confirm action 1?',
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'input-2',
          task_id: taskId,
          user_id: userId,
          request_type: 'input',
          prompt: 'Enter value',
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      mockSupabaseClient.order.mockResolvedValue({
        data: pendingInputsRows,
        error: null,
      });

      // Act
      const result = await service.getPendingInputsForTask(taskId, userId);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('input-1');
      expect(result[1]?.id).toBe('input-2');
    });
  });

  describe('cancelHumanInput', () => {
    it('should cancel a pending input', async () => {
      const inputId = 'input-123';
      const userId = 'user-123';

      // Create a mock chain for update operation with multiple .eq() calls
      const mockUpdateChain: any = {};
      // First two .eq() calls return the chain, third returns the result
      mockUpdateChain.eq = jest
        .fn()
        .mockReturnValueOnce(mockUpdateChain) // First eq() - returns chain
        .mockReturnValueOnce(mockUpdateChain) // Second eq() - returns chain
        .mockResolvedValueOnce({ error: null }); // Third eq() - returns result

      mockSupabaseClient.from.mockReturnValue({
        update: jest.fn().mockReturnValue(mockUpdateChain),
      });

      // Act
      await service.cancelHumanInput(inputId, userId);

      // Assert
      expect(mockSupabaseClient.from).toHaveBeenCalled();
    });
  });

  describe('handleHumanInputTimeout', () => {
    it('should mark input as timed out and emit events', async () => {
      const inputId = 'input-timeout';

      const timeoutInputRow = {
        id: inputId,
        task_id: 'task-123',
        user_id: 'user-123',
        request_type: 'confirmation',
        prompt: 'Timeout test',
        status: 'timeout',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Create a fresh mock chain for update operation
      const mockUpdateChain = {
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: timeoutInputRow,
          error: null,
        }),
      };
      mockSupabaseClient.from.mockReturnValue({
        update: jest.fn().mockReturnValue(mockUpdateChain),
      });

      // Act
      const result = await service.handleHumanInputTimeout(inputId);

      // Assert
      expect(result.status).toBe('timeout');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'human_input.timeout',
        expect.objectContaining({
          taskId: 'task-123',
          inputId,
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'task.resumed',
        expect.objectContaining({
          taskId: 'task-123',
        }),
      );
    });
  });

  describe('cleanupExpiredInputs', () => {
    it('should cleanup expired pending inputs', async () => {
      const expiredInputs = [
        {
          id: 'input-expired-1',
          task_id: 'task-1',
          user_id: 'user-1',
        },
        {
          id: 'input-expired-2',
          task_id: 'task-2',
          user_id: 'user-2',
        },
      ];

      // Create a fresh mock chain for update operation
      const mockUpdateChain = {
        eq: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue({
          data: expiredInputs,
          error: null,
        }),
      };
      mockSupabaseClient.from.mockReturnValue({
        update: jest.fn().mockReturnValue(mockUpdateChain),
      });

      // Act
      const count = await service.cleanupExpiredInputs();

      // Assert
      expect(count).toBe(2);
      expect(eventEmitter.emit).toHaveBeenCalledTimes(4); // 2 timeout events + 2 resumed events
    });

    it('should handle empty cleanup', async () => {
      // Create a fresh mock chain for update operation
      const mockUpdateChain = {
        eq: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };
      mockSupabaseClient.from.mockReturnValue({
        update: jest.fn().mockReturnValue(mockUpdateChain),
      });

      // Act
      const count = await service.cleanupExpiredInputs();

      // Assert
      expect(count).toBe(0);
    });
  });
});
