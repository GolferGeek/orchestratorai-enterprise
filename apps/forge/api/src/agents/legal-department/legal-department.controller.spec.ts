import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LegalDepartmentController } from './legal-department.controller';
import { LegalDepartmentService } from './legal-department.service';
import { LegalDepartmentRequestDto } from './dto';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

const mockCtx: ExecutionContext = {
  orgSlug: 'test-org',
  userId: 'test-user',
  conversationId: 'conv-123',
  taskId: 'task-ctrl-123',
  planId: 'plan-123',
  deliverableId: 'deliverable-123',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
};

const mockCompletedResult = {
  taskId: 'task-ctrl-123',
  status: 'completed' as const,
  userMessage: 'test message',
  response: 'Legal analysis complete',
  duration: 1500,
};

const mockFailedResult = {
  taskId: 'task-ctrl-123',
  status: 'failed' as const,
  userMessage: 'test message',
  error: 'Analysis failed',
  duration: 500,
};

describe('LegalDepartmentController', () => {
  let controller: LegalDepartmentController;
  let mockService: jest.Mocked<LegalDepartmentService>;

  beforeEach(async () => {
    mockService = {
      process: jest.fn().mockResolvedValue(mockCompletedResult),
      getStatus: jest.fn().mockResolvedValue({
        taskId: 'task-ctrl-123',
        status: 'completed',
        userMessage: 'test message',
        response: 'Legal analysis complete',
      }),
      getHistory: jest.fn().mockResolvedValue([
        { status: 'started', userMessage: 'test' },
        { status: 'completed', userMessage: 'test', response: 'done' },
      ]),
      onModuleInit: jest.fn(),
    } as unknown as jest.Mocked<LegalDepartmentService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LegalDepartmentController],
      providers: [{ provide: LegalDepartmentService, useValue: mockService }],
    }).compile();

    controller = module.get<LegalDepartmentController>(
      LegalDepartmentController,
    );
  });

  describe('processRoot (POST /legal-department)', () => {
    it('should call process and return success result', async () => {
      const dto: LegalDepartmentRequestDto = {
        context: mockCtx,
        userMessage: 'Analyze this contract',
      };

      const result = await controller.processRoot(dto);

      expect(result.success).toBe(true);
      expect(result.data.taskId).toBe('task-ctrl-123');
      expect(result.data.status).toBe('completed');
    });

    it('should throw BadRequestException when no context provided', async () => {
      const dto = { userMessage: 'test' } as any;

      await expect(controller.processRoot(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should delegate to process method', async () => {
      const dto: LegalDepartmentRequestDto = {
        context: mockCtx,
        userMessage: 'test',
      };

      await controller.processRoot(dto);

      expect(mockService.process).toHaveBeenCalledWith({
        context: mockCtx,
        userMessage: 'test',
        documents: undefined,
        legalMetadata: undefined,
      });
    });
  });

  describe('process (POST /legal-department/process)', () => {
    it('should call service.process with correct parameters', async () => {
      const dto: LegalDepartmentRequestDto = {
        context: mockCtx,
        userMessage: 'What does this contract mean?',
        documents: [{ name: 'contract.pdf', content: 'contract content' }],
      };

      const result = await controller.process(dto);

      expect(mockService.process).toHaveBeenCalledWith({
        context: mockCtx,
        userMessage: 'What does this contract mean?',
        documents: [{ name: 'contract.pdf', content: 'contract content' }],
        legalMetadata: undefined,
      });
      expect(result.success).toBe(true);
    });

    it('should return success=false when workflow fails', async () => {
      mockService.process.mockResolvedValue(mockFailedResult);

      const dto: LegalDepartmentRequestDto = {
        context: mockCtx,
        userMessage: 'test',
      };

      const result = await controller.process(dto);
      expect(result.success).toBe(false);
    });

    it('should throw BadRequestException when context is missing', async () => {
      const dto = { userMessage: 'no context here' } as any;

      await expect(controller.process(dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.process(dto)).rejects.toThrow(
        'ExecutionContext is required',
      );
    });

    it('should throw BadRequestException when service throws', async () => {
      mockService.process.mockRejectedValue(new Error('Unexpected error'));

      const dto: LegalDepartmentRequestDto = {
        context: mockCtx,
        userMessage: 'test',
      };

      await expect(controller.process(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should include legalMetadata in service call', async () => {
      const metadata = {
        documentType: { type: 'NDA', confidence: 0.9 },
        sections: {
          sections: [],
          confidence: 0.5,
          structureType: 'formal' as const,
        },
        signatures: { signatures: [], confidence: 0.5, partyCount: 0 },
        dates: { dates: [], confidence: 0.5 },
        parties: { parties: [], confidence: 0.5 },
        confidence: {
          overall: 0.9,
          breakdown: {},
          factors: {
            textQuality: 0.9,
            extractionMethod: 'native' as const,
            completeness: 0.9,
            patternMatchCount: 5,
          },
        },
        extractedAt: new Date().toISOString(),
      };

      const dto: LegalDepartmentRequestDto = {
        context: mockCtx,
        userMessage: 'analyze',
        legalMetadata: metadata,
      };

      await controller.process(dto);

      expect(mockService.process).toHaveBeenCalledWith(
        expect.objectContaining({ legalMetadata: metadata }),
      );
    });

    it('should rethrow non-Error exceptions as BadRequestException', async () => {
      mockService.process.mockRejectedValue('string error');

      const dto: LegalDepartmentRequestDto = {
        context: mockCtx,
        userMessage: 'test',
      };

      await expect(controller.process(dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getStatus (GET /legal-department/status/:threadId)', () => {
    it('should return workflow status', async () => {
      const result = await controller.getStatus('task-ctrl-123');

      expect(result.success).toBe(true);
      expect(result.data.taskId).toBe('task-ctrl-123');
      expect(result.data.status).toBe('completed');
    });

    it('should call service.getStatus with correct threadId', async () => {
      await controller.getStatus('specific-thread-id');

      expect(mockService.getStatus).toHaveBeenCalledWith('specific-thread-id');
    });

    it('should throw NotFoundException when status is null', async () => {
      mockService.getStatus.mockResolvedValue(null);

      await expect(controller.getStatus('nonexistent-thread')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should include workflow not found message', async () => {
      mockService.getStatus.mockResolvedValue(null);

      await expect(controller.getStatus('missing-thread')).rejects.toThrow(
        'Workflow not found: missing-thread',
      );
    });
  });

  describe('getHistory (GET /legal-department/history/:threadId)', () => {
    it('should return workflow history', async () => {
      const result = await controller.getHistory('task-ctrl-123');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.count).toBe(2);
    });

    it('should call service.getHistory with correct threadId', async () => {
      await controller.getHistory('specific-thread-id');

      expect(mockService.getHistory).toHaveBeenCalledWith('specific-thread-id');
    });

    it('should throw NotFoundException when history is empty', async () => {
      mockService.getHistory.mockResolvedValue([]);

      await expect(controller.getHistory('nonexistent-thread')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should include workflow not found message for empty history', async () => {
      mockService.getHistory.mockResolvedValue([]);

      await expect(controller.getHistory('missing-thread')).rejects.toThrow(
        'Workflow not found: missing-thread',
      );
    });
  });
});
