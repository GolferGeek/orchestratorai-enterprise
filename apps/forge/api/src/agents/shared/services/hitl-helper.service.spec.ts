import { Test, TestingModule } from '@nestjs/testing';
import {
  HITLHelperService,
  HitlRequest,
  HitlResponse,
  HitlState,
} from './hitl-helper.service';
import { ObservabilityService } from './observability.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * Unit tests for HITLHelperService
 *
 * Tests the helper service for managing human-in-the-loop patterns
 * in LangGraph workflows.
 */
describe('HITLHelperService', () => {
  let service: HITLHelperService;
  let observability: jest.Mocked<ObservabilityService>;
  const mockContext = createMockExecutionContext();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HITLHelperService,
        {
          provide: ObservabilityService,
          useValue: {
            emitHitlWaiting: jest.fn().mockResolvedValue(undefined),
            emitHitlResumed: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<HITLHelperService>(HITLHelperService);
    observability = module.get(ObservabilityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('prepareInterrupt', () => {
    const mockRequest: HitlRequest = {
      taskId: 'task-123',
      threadId: 'thread-456',
      agentSlug: 'extended-post-writer',
      userId: 'user-789',
      conversationId: 'conv-abc',
      organizationSlug: 'org-xyz',
      pendingContent: { blogPost: 'Draft content...' },
      contentType: 'blog-post',
      message: 'Please review the blog post',
    };

    const mockCurrentState: HitlState = {
      hitlStatus: 'none',
    };

    it('should prepare state for HITL interrupt', async () => {
      const result = await service.prepareInterrupt(
        mockCurrentState,
        mockRequest,
        mockContext,
      );

      expect(result.hitlRequest).toEqual(mockRequest);
      expect(result.hitlStatus).toBe('waiting');
    });

    it('should emit HITL waiting observability event', async () => {
      await service.prepareInterrupt(
        mockCurrentState,
        mockRequest,
        mockContext,
      );

      // emitHitlWaiting takes: context, threadId, pendingContent, message
      expect(observability.emitHitlWaiting).toHaveBeenCalledWith(
        mockContext,
        'thread-456',
        { blogPost: 'Draft content...' },
        'Please review the blog post',
      );
    });

    it('should use default message when not provided', async () => {
      const requestWithoutMessage: HitlRequest = {
        ...mockRequest,
        message: undefined,
      };

      await service.prepareInterrupt(
        mockCurrentState,
        requestWithoutMessage,
        mockContext,
      );

      // emitHitlWaiting takes: context, threadId, pendingContent, message
      expect(observability.emitHitlWaiting).toHaveBeenCalledWith(
        expect.anything(),
        'thread-456',
        expect.anything(),
        'Awaiting review for blog-post',
      );
    });

    it('should preserve existing state properties', async () => {
      const stateWithExtraProps = {
        ...mockCurrentState,
        customField: 'custom value',
        anotherField: 123,
      };

      const result = await service.prepareInterrupt(
        stateWithExtraProps,
        mockRequest,
        mockContext,
      );

      expect(result.customField).toBe('custom value');
      expect(result.anotherField).toBe(123);
    });
  });

  describe('processResume', () => {
    const mockRequest: HitlRequest = {
      taskId: 'task-123',
      threadId: 'thread-456',
      agentSlug: 'extended-post-writer',
      userId: 'user-789',
      conversationId: 'conv-abc',
      pendingContent: { blogPost: 'Draft content...' },
      contentType: 'blog-post',
    };

    const stateWithRequest: HitlState = {
      hitlRequest: mockRequest,
      hitlStatus: 'waiting',
    };

    it('should process approve decision', async () => {
      const response: HitlResponse = {
        decision: 'approve',
      };

      const result = await service.processResume(
        stateWithRequest,
        response,
        mockContext,
      );

      expect(result.hitlResponse).toEqual(response);
      expect(result.hitlStatus).toBe('resumed');
    });

    it('should process edit decision with edited content', async () => {
      const response: HitlResponse = {
        decision: 'edit',
        editedContent: { blogPost: 'Edited content...' },
      };

      const result = await service.processResume(
        stateWithRequest,
        response,
        mockContext,
      );

      expect(result.hitlResponse).toEqual(response);
      expect(result.hitlResponse?.editedContent).toEqual({
        blogPost: 'Edited content...',
      });
    });

    it('should process reject decision with feedback', async () => {
      const response: HitlResponse = {
        decision: 'reject',
        feedback: 'Content is too long',
      };

      const result = await service.processResume(
        stateWithRequest,
        response,
        mockContext,
      );

      expect(result.hitlResponse?.decision).toBe('reject');
      expect(result.hitlResponse?.feedback).toBe('Content is too long');
    });

    it('should emit HITL resumed observability event', async () => {
      const response: HitlResponse = { decision: 'approve' };

      await service.processResume(stateWithRequest, response, mockContext);

      // emitHitlResumed takes: context, threadId, decision, message
      expect(observability.emitHitlResumed).toHaveBeenCalledWith(
        mockContext,
        'thread-456',
        'approve',
        'Decision: approve',
      );
    });

    it('should use feedback as message when provided', async () => {
      const response: HitlResponse = {
        decision: 'reject',
        feedback: 'Needs more detail',
      };

      await service.processResume(stateWithRequest, response, mockContext);

      // emitHitlResumed takes: context, threadId, decision, message
      expect(observability.emitHitlResumed).toHaveBeenCalledWith(
        expect.anything(),
        'thread-456',
        'reject',
        'Needs more detail',
      );
    });

    it('should throw error when no prior HITL request exists', async () => {
      const stateWithoutRequest: HitlState = {
        hitlStatus: 'none',
      };

      const response: HitlResponse = { decision: 'approve' };

      await expect(
        service.processResume(stateWithoutRequest, response, mockContext),
      ).rejects.toThrow('Cannot process resume without prior HITL request');
    });
  });

  describe('getResolvedContent', () => {
    const pendingContent = { blogPost: 'Original content' };
    const editedContent = { blogPost: 'Edited content' };

    it('should return pending content for approve decision', () => {
      const state: HitlState = {
        hitlRequest: {
          taskId: 't1',
          threadId: 'th1',
          agentSlug: 'agent',
          userId: 'u1',
          pendingContent,
          contentType: 'blog',
        },
        hitlResponse: { decision: 'approve' },
        hitlStatus: 'resumed',
      };

      const result = service.getResolvedContent<typeof pendingContent>(state);
      expect(result).toEqual(pendingContent);
    });

    it('should return edited content for edit decision', () => {
      const state: HitlState = {
        hitlRequest: {
          taskId: 't1',
          threadId: 'th1',
          agentSlug: 'agent',
          userId: 'u1',
          pendingContent,
          contentType: 'blog',
        },
        hitlResponse: { decision: 'edit', editedContent },
        hitlStatus: 'resumed',
      };

      const result = service.getResolvedContent<typeof editedContent>(state);
      expect(result).toEqual(editedContent);
    });

    it('should return null for reject decision', () => {
      const state: HitlState = {
        hitlRequest: {
          taskId: 't1',
          threadId: 'th1',
          agentSlug: 'agent',
          userId: 'u1',
          pendingContent,
          contentType: 'blog',
        },
        hitlResponse: { decision: 'reject', feedback: 'Bad content' },
        hitlStatus: 'resumed',
      };

      const result = service.getResolvedContent(state);
      expect(result).toBeNull();
    });

    it('should return null when no response exists', () => {
      const state: HitlState = {
        hitlRequest: {
          taskId: 't1',
          threadId: 'th1',
          agentSlug: 'agent',
          userId: 'u1',
          pendingContent,
          contentType: 'blog',
        },
        hitlStatus: 'waiting',
      };

      const result = service.getResolvedContent(state);
      expect(result).toBeNull();
    });

    it('should return null when no request exists', () => {
      const state: HitlState = {
        hitlStatus: 'none',
      };

      const result = service.getResolvedContent(state);
      expect(result).toBeNull();
    });
  });

  describe('wasRejected', () => {
    it('should return true for reject decision', () => {
      const state: HitlState = {
        hitlResponse: { decision: 'reject' },
        hitlStatus: 'resumed',
      };

      expect(service.wasRejected(state)).toBe(true);
    });

    it('should return false for approve decision', () => {
      const state: HitlState = {
        hitlResponse: { decision: 'approve' },
        hitlStatus: 'resumed',
      };

      expect(service.wasRejected(state)).toBe(false);
    });

    it('should return false for edit decision', () => {
      const state: HitlState = {
        hitlResponse: { decision: 'edit' },
        hitlStatus: 'resumed',
      };

      expect(service.wasRejected(state)).toBe(false);
    });

    it('should return false when no response', () => {
      const state: HitlState = {
        hitlStatus: 'waiting',
      };

      expect(service.wasRejected(state)).toBe(false);
    });
  });

  describe('isWaiting', () => {
    it('should return true when status is waiting', () => {
      const state: HitlState = { hitlStatus: 'waiting' };
      expect(service.isWaiting(state)).toBe(true);
    });

    it('should return false when status is none', () => {
      const state: HitlState = { hitlStatus: 'none' };
      expect(service.isWaiting(state)).toBe(false);
    });

    it('should return false when status is resumed', () => {
      const state: HitlState = { hitlStatus: 'resumed' };
      expect(service.isWaiting(state)).toBe(false);
    });
  });

  describe('isResumed', () => {
    it('should return true when status is resumed', () => {
      const state: HitlState = { hitlStatus: 'resumed' };
      expect(service.isResumed(state)).toBe(true);
    });

    it('should return false when status is waiting', () => {
      const state: HitlState = { hitlStatus: 'waiting' };
      expect(service.isResumed(state)).toBe(false);
    });

    it('should return false when status is none', () => {
      const state: HitlState = { hitlStatus: 'none' };
      expect(service.isResumed(state)).toBe(false);
    });
  });

  describe('clearHitlState', () => {
    it('should clear all HITL state fields', () => {
      const state: HitlState = {
        hitlRequest: {
          taskId: 't1',
          threadId: 'th1',
          agentSlug: 'agent',
          userId: 'u1',
          pendingContent: {},
          contentType: 'blog',
        },
        hitlResponse: { decision: 'approve' },
        hitlStatus: 'resumed',
      };

      const result = service.clearHitlState(state);

      expect(result.hitlRequest).toBeUndefined();
      expect(result.hitlResponse).toBeUndefined();
      expect(result.hitlStatus).toBe('none');
    });

    it('should preserve non-HITL state fields', () => {
      const state = {
        hitlRequest: {
          taskId: 't1',
          threadId: 'th1',
          agentSlug: 'agent',
          userId: 'u1',
          pendingContent: {},
          contentType: 'blog',
        },
        hitlStatus: 'resumed' as const,
        customField: 'value',
        count: 42,
      };

      const result = service.clearHitlState(state);

      expect(result.customField).toBe('value');
      expect(result.count).toBe(42);
    });
  });

  describe('buildInterruptValue', () => {
    it('should build interrupt value with all fields', () => {
      const request: HitlRequest = {
        taskId: 'task-123',
        threadId: 'thread-456',
        agentSlug: 'extended-post-writer',
        userId: 'user-789',
        conversationId: 'conv-abc',
        pendingContent: { blogPost: 'Content...' },
        contentType: 'blog-post',
        message: 'Please review',
      };

      const result = service.buildInterruptValue(request);

      expect(result).toEqual({
        reason: 'human_review',
        taskId: 'task-123',
        threadId: 'thread-456',
        agentSlug: 'extended-post-writer',
        userId: 'user-789',
        conversationId: 'conv-abc',
        contentType: 'blog-post',
        pendingContent: { blogPost: 'Content...' },
        message: 'Please review',
      });
    });

    it('should handle missing optional fields', () => {
      const request: HitlRequest = {
        taskId: 'task-123',
        threadId: 'thread-456',
        agentSlug: 'agent',
        userId: 'user-789',
        pendingContent: {},
        contentType: 'generic',
      };

      const result = service.buildInterruptValue(request);

      expect(result.conversationId).toBeUndefined();
      expect(result.message).toBeUndefined();
      expect(result.reason).toBe('human_review');
    });
  });
});
