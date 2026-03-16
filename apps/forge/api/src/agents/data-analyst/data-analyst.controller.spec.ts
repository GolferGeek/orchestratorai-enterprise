import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataAnalystController } from './data-analyst.controller';
import { DataAnalystService } from './data-analyst.service';
import { DataAnalystResult, DataAnalystStatus } from './data-analyst.state';
import { DataAnalystRequestDto } from './dto';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * Unit tests for DataAnalystController
 *
 * Tests the REST API endpoints for the Data Analyst agent.
 */
describe('DataAnalystController', () => {
  let controller: DataAnalystController;
  let service: jest.Mocked<DataAnalystService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DataAnalystController],
      providers: [
        {
          provide: DataAnalystService,
          useValue: {
            analyze: jest.fn(),
            getStatus: jest.fn(),
            getHistory: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<DataAnalystController>(DataAnalystController);
    service = module.get(DataAnalystService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /data-analyst/analyze', () => {
    const mockContext = createMockExecutionContext({
      conversationId: 'conv-123',
      userId: 'user-456',
      conversationId: 'conv-789',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    });

    const validRequest: DataAnalystRequestDto = {
      context: mockContext,
      userMessage: 'How many users are there?',
    };

    it('should return success for completed analysis', async () => {
      const mockResult: DataAnalystResult = {
        conversationId: 'conv-123',
        status: 'completed',
        userMessage: validRequest.userMessage,
        summary: 'There are 100 users in the database.',
        generatedSql: 'SELECT COUNT(*) FROM users',
        sqlResults: 'count: 100',
        duration: 5000,
      };

      service.analyze.mockResolvedValue(mockResult);

      const result = await controller.analyze(validRequest);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResult);
    });

    it('should return success=false for failed analysis', async () => {
      const mockResult: DataAnalystResult = {
        conversationId: 'conv-123',
        status: 'failed',
        userMessage: validRequest.userMessage,
        error: 'Database connection failed',
        duration: 1000,
      };

      service.analyze.mockResolvedValue(mockResult);

      const result = await controller.analyze(validRequest);

      expect(result.success).toBe(false);
      expect(result.data.status).toBe('failed');
      expect(result.data.error).toBe('Database connection failed');
    });

    it('should throw BadRequestException on service error', async () => {
      service.analyze.mockRejectedValue(new Error('Invalid input'));

      await expect(controller.analyze(validRequest)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should pass context and userMessage to service', async () => {
      service.analyze.mockResolvedValue({
        conversationId: 'conv-123',
        status: 'completed',
        userMessage: validRequest.userMessage,
        duration: 1000,
      });

      await controller.analyze(validRequest);

      expect(service.analyze).toHaveBeenCalledWith({
        context: validRequest.context,
        userMessage: validRequest.userMessage,
      });
    });
  });

  describe('GET /data-analyst/status/:threadId', () => {
    it('should return status for existing thread', async () => {
      const mockStatus: DataAnalystStatus = {
        conversationId: 'conv-123',
        status: 'completed',
        userMessage: 'Test question',
        summary: 'Test summary',
      };

      service.getStatus.mockResolvedValue(mockStatus);

      const result = await controller.getStatus('task-123');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockStatus);
      expect(service.getStatus).toHaveBeenCalledWith('task-123');
    });

    it('should throw NotFoundException for non-existent thread', async () => {
      service.getStatus.mockResolvedValue(null);

      await expect(controller.getStatus('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return in-progress status', async () => {
      const mockStatus: DataAnalystStatus = {
        conversationId: 'conv-123',
        status: 'querying',
        userMessage: 'Test question',
      };

      service.getStatus.mockResolvedValue(mockStatus);

      const result = await controller.getStatus('task-123');

      expect(result.data.status).toBe('querying');
    });

    it('should return failed status with error', async () => {
      const mockStatus: DataAnalystStatus = {
        conversationId: 'conv-123',
        status: 'failed',
        userMessage: 'Test question',
        error: 'Something went wrong',
      };

      service.getStatus.mockResolvedValue(mockStatus);

      const result = await controller.getStatus('task-123');

      expect(result.data.status).toBe('failed');
      expect(result.data.error).toBe('Something went wrong');
    });
  });

  describe('GET /data-analyst/history/:threadId', () => {
    it('should return history for existing thread', async () => {
      const mockHistory = [
        { status: 'started', userMessage: 'Test', conversationId: 'conv-1' },
        { status: 'discovering', userMessage: 'Test', conversationId: 'conv-1' },
        {
          status: 'completed',
          userMessage: 'Test',
          conversationId: 'conv-1',
          summary: 'Done',
        },
      ];

      service.getHistory.mockResolvedValue(mockHistory as never);

      const result = await controller.getHistory('task-123');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
      expect(result.count).toBe(3);
    });

    it('should throw NotFoundException for empty history', async () => {
      service.getHistory.mockResolvedValue([]);

      await expect(controller.getHistory('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return history in correct order', async () => {
      const mockHistory = [
        { status: 'started', conversationId: 'conv-1', userMessage: 'Q' },
        { status: 'completed', conversationId: 'conv-1', userMessage: 'Q' },
      ];

      service.getHistory.mockResolvedValue(mockHistory as never);

      const result = await controller.getHistory('task-123');

      expect(result.data[0]!.status).toBe('started');
      expect(result.data[1]!.status).toBe('completed');
    });
  });
});
