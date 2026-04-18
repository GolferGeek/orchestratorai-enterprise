import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  applyRemoteAuthOverrides as applyAuthOverrides,
  resetAuthMocks,
} from '@orchestratorai/auth-client/testing';
import { ExtendedPostWriterController } from './extended-post-writer.controller';
import { ExtendedPostWriterService } from './extended-post-writer.service';
import {
  ExtendedPostWriterResult,
  ExtendedPostWriterStatus,
} from './extended-post-writer.state';
import {
  ExtendedPostWriterRequestDto,
  ExtendedPostWriterResumeDto,
} from './dto';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * Unit tests for ExtendedPostWriterController
 *
 * Tests the REST API endpoints for the Extended Post Writer agent
 * with HITL workflow support.
 */
describe('ExtendedPostWriterController', () => {
  let controller: ExtendedPostWriterController;
  let service: jest.Mocked<ExtendedPostWriterService>;
  const mockContext = createMockExecutionContext({
    conversationId: 'conv-123',
    userId: 'user-456',
    orgSlug: 'test-org',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
  });

  beforeEach(async () => {
    resetAuthMocks();
    const module: TestingModule = await applyAuthOverrides(
      Test.createTestingModule({
        controllers: [ExtendedPostWriterController],
        providers: [
          {
            provide: ExtendedPostWriterService,
            useValue: {
              generate: jest.fn(),
              resume: jest.fn(),
              getStatus: jest.fn(),
              getHistory: jest.fn(),
            },
          },
        ],
      }),
    ).compile();

    controller = module.get<ExtendedPostWriterController>(
      ExtendedPostWriterController,
    );
    service = module.get(ExtendedPostWriterService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /extended-post-writer/generate', () => {
    const validRequest: ExtendedPostWriterRequestDto = {
      context: mockContext,
      userMessage: 'Write about Introduction to AI',
      contextInfo: 'Write for beginners',
      tone: 'casual',
    };

    it('should return success with HITL waiting status', async () => {
      const mockResult: ExtendedPostWriterResult = {
        taskId: 'conv-123',
        status: 'hitl_waiting',
        userMessage: validRequest.userMessage,
        generatedContent: {
          blogPost: 'Draft blog post...',
          seoDescription: 'SEO description',
          socialPosts: ['Social 1', 'Social 2'],
        },
      };

      service.generate.mockResolvedValue(mockResult);

      const result = await controller.generate(validRequest);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResult);
      expect(result.message).toBe('Content generated. Awaiting human review.');
    });

    it('should return success for completed status', async () => {
      const mockResult: ExtendedPostWriterResult = {
        taskId: 'conv-123',
        status: 'completed',
        userMessage: validRequest.userMessage,
        finalContent: {
          blogPost: 'Final blog post',
          seoDescription: 'Final SEO',
          socialPosts: ['Social 1'],
        },
      };

      service.generate.mockResolvedValue(mockResult);

      const result = await controller.generate(validRequest);

      expect(result.success).toBe(true);
      expect(result.message).toBeUndefined();
    });

    it('should return success=false for failed status', async () => {
      const mockResult: ExtendedPostWriterResult = {
        taskId: 'conv-123',
        status: 'failed',
        userMessage: validRequest.userMessage,
        error: 'LLM API error',
      };

      service.generate.mockResolvedValue(mockResult);

      const result = await controller.generate(validRequest);

      expect(result.success).toBe(false);
      expect(result.data.error).toBe('LLM API error');
    });

    it('should throw BadRequestException on service error', async () => {
      service.generate.mockRejectedValue(new Error('Invalid topic'));

      await expect(controller.generate(validRequest)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when context is missing', async () => {
      const invalidRequest = {
        userMessage: 'Test message',
      } as ExtendedPostWriterRequestDto;

      await expect(controller.generate(invalidRequest)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('POST /extended-post-writer/resume/:threadId', () => {
    describe('approve decision', () => {
      it('should return completed status for approve', async () => {
        const mockResult: ExtendedPostWriterResult = {
          taskId: 'conv-123',
          status: 'completed',
          userMessage: 'Test topic',
          finalContent: {
            blogPost: 'Approved blog',
            seoDescription: 'SEO',
            socialPosts: [],
          },
        };

        service.resume.mockResolvedValue(mockResult);

        const request: ExtendedPostWriterResumeDto = {
          decision: 'approve',
        };

        const result = await controller.resume('task-123', request);

        expect(result.success).toBe(true);
        expect(result.message).toBe('Content finalized successfully.');
        expect(service.resume).toHaveBeenCalledWith('task-123', {
          decision: 'approve',
          editedContent: undefined,
          feedback: undefined,
        });
      });
    });

    describe('replace decision', () => {
      it('should return completed status with replaced content', async () => {
        const mockResult: ExtendedPostWriterResult = {
          taskId: 'conv-123',
          status: 'completed',
          userMessage: 'Test topic',
          finalContent: {
            blogPost: 'Edited blog',
            seoDescription: 'Edited SEO',
            socialPosts: ['Edited social'],
          },
        };

        service.resume.mockResolvedValue(mockResult);

        const request: ExtendedPostWriterResumeDto = {
          decision: 'edit',
          editedContent: {
            blogPost: 'Edited blog',
            seoDescription: 'Edited SEO',
            socialPosts: ['Edited social'],
          },
        };

        const result = await controller.resume('task-123', request);

        expect(result.success).toBe(true);
        expect(service.resume).toHaveBeenCalledWith('task-123', {
          decision: 'edit',
          editedContent: request.editedContent,
          feedback: undefined,
        });
      });
    });

    describe('reject decision', () => {
      it('should return rejected status with feedback', async () => {
        const mockResult: ExtendedPostWriterResult = {
          taskId: 'conv-123',
          status: 'rejected',
          userMessage: 'Test topic',
        };

        service.resume.mockResolvedValue(mockResult);

        const request: ExtendedPostWriterResumeDto = {
          decision: 'reject',
          feedback: 'Content is off-topic',
        };

        const result = await controller.resume('task-123', request);

        // status "rejected" is not "failed", so success is true
        expect(result.success).toBe(true);
        expect(result.message).toBe('Content rejected.');
        expect(service.resume).toHaveBeenCalledWith('task-123', {
          decision: 'reject',
          editedContent: undefined,
          feedback: 'Content is off-topic',
        });
      });
    });

    it('should throw BadRequestException on service error', async () => {
      service.resume.mockRejectedValue(new Error('Thread not found'));

      const request: ExtendedPostWriterResumeDto = {
        decision: 'approve',
      };

      await expect(
        controller.resume('invalid-thread', request),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('GET /extended-post-writer/status/:threadId', () => {
    it('should return status for existing thread', async () => {
      const mockStatus: ExtendedPostWriterStatus = {
        taskId: 'conv-123',
        status: 'hitl_waiting',
        userMessage: 'Test topic',
        hitlPending: true,
        generatedContent: {
          blogPost: 'Draft',
          seoDescription: 'SEO',
          socialPosts: [],
        },
      };

      service.getStatus.mockResolvedValue(mockStatus);

      const result = await controller.getStatus('task-123');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockStatus);
      expect(result.data.hitlPending).toBe(true);
    });

    it('should throw NotFoundException for non-existent thread', async () => {
      service.getStatus.mockResolvedValue(null);

      await expect(controller.getStatus('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return completed status with final content', async () => {
      const mockStatus: ExtendedPostWriterStatus = {
        taskId: 'conv-123',
        status: 'completed',
        userMessage: 'Test topic',
        hitlPending: false,
        finalContent: {
          blogPost: 'Final',
          seoDescription: 'Final SEO',
          socialPosts: ['Social'],
        },
      };

      service.getStatus.mockResolvedValue(mockStatus);

      const result = await controller.getStatus('task-123');

      expect(result.data.hitlPending).toBe(false);
      expect(result.data.finalContent).toBeDefined();
    });
  });

  describe('GET /extended-post-writer/history/:threadId', () => {
    it('should return history for existing thread', async () => {
      const mockHistory = [
        { status: 'started', userMessage: 'Test' },
        { status: 'generating', userMessage: 'Test' },
        { status: 'hitl_waiting', userMessage: 'Test' },
        { status: 'completed', userMessage: 'Test' },
      ];

      service.getHistory.mockResolvedValue(mockHistory as never);

      const result = await controller.getHistory('task-123');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(4);
      expect(result.count).toBe(4);
    });

    it('should throw NotFoundException for empty history', async () => {
      service.getHistory.mockResolvedValue([]);

      await expect(controller.getHistory('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should show HITL state transitions in history', async () => {
      const mockHistory = [
        { status: 'started', userMessage: 'T' },
        { status: 'hitl_waiting', userMessage: 'T' },
        { status: 'regenerating', userMessage: 'T' },
        { status: 'completed', userMessage: 'T' },
      ];

      service.getHistory.mockResolvedValue(mockHistory as never);

      const result = await controller.getHistory('task-123');

      const statuses = result.data.map((s: { status: string }) => s.status);
      expect(statuses).toContain('hitl_waiting');
      expect(statuses).toContain('regenerating');
    });
  });
});
