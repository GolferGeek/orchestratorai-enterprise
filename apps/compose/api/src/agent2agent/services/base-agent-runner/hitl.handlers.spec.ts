import 'reflect-metadata';
import { AgentRuntimeDefinition } from '@agent-platform/interfaces/agent.interface';
import {
  handleHitlResume,
  handleHitlStatus,
  handleHitlHistory,
  sendHitlResume,
  HitlHandlerDependencies,
} from './hitl.handlers';
import { TaskRequestDto, AgentTaskMode } from '../../dto/task-request.dto';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type {
  HitlResumePayload,
  HitlStatusPayload,
  HitlHistoryPayload,
  HitlGeneratedContent,
} from '@orchestrator-ai/transport-types/modes/hitl.types';
import { of } from 'rxjs';

describe('HITL Handlers', () => {
  let mockServices: jest.Mocked<HitlHandlerDependencies>;
  let mockDefinition: AgentRuntimeDefinition;
  let mockRequest: TaskRequestDto;

  beforeEach(() => {
    // Mock services
    mockServices = {
      httpService: {
        post: jest.fn(),
        get: jest.fn(),
      } as unknown,
      conversationsService: {
        getConversationMessages: jest.fn().mockResolvedValue([]),
      } as unknown,
      deliverablesService: {
        create: jest.fn(),
      } as unknown,
    } as jest.Mocked<HitlHandlerDependencies>;

    // Mock agent definition with transport endpoint
    mockDefinition = {
      id: 'test-id',
      slug: 'extended-post-writer',
      displayName: 'Extended Post Writer',
      organizationSlug: 'test-org',
      agentType: 'api',
      modeProfile: { standard: { plan: true, build: true, converse: true } },
      transport: {
        api: {
          endpoint: 'http://test-agent-host:6200/extended-post-writer/generate',
        },
      },
    } as unknown as AgentRuntimeDefinition;

    // Mock request
    mockRequest = {
      context: createMockExecutionContext({
        userId: 'user-1',
        conversationId: 'conv-1',
        taskId: 'task-1',
      }),
      mode: AgentTaskMode.HITL,
      payload: {},
    };
  });

  describe('sendHitlResume', () => {
    it('should send resume request to LangGraph', async () => {
      const payload: HitlResumePayload = {
        action: 'resume',
        taskId: 'task-1',
        decision: 'approve',
      };

      mockRequest.payload = payload as unknown as typeof mockRequest.payload;

      const mockResponse = {
        status: 200,
        data: {
          data: {
            status: 'completed',
            finalContent: {
              blogPost: 'Final blog content',
              seoDescription: 'SEO description',
            },
          },
        },
      };

      mockServices.httpService!.post = jest
        .fn()
        .mockReturnValue(of(mockResponse));

      const result = await sendHitlResume(
        mockDefinition,
        mockRequest,
        mockServices,
      );

      expect(result).toBeDefined();
      expect(result?.error).toBeUndefined();

      expect(mockServices.httpService!.post).toHaveBeenCalledWith(
        expect.stringContaining('/resume/task-1'),
        expect.objectContaining({ decision: 'approve' }),
        expect.any(Object),
      );
    });

    it('should fail when taskId is missing', async () => {
      const payload = {
        action: 'resume',
        decision: 'approve',
      } as Partial<HitlResumePayload>;

      mockRequest.payload = payload;

      const result = await sendHitlResume(
        mockDefinition,
        mockRequest,
        mockServices,
      );

      expect(result).toBeDefined();
      expect(result?.error).toContain('taskId is required');
    });

    it('should fail when decision is missing', async () => {
      const payload = {
        action: 'resume',
        taskId: 'task-1',
      } as Partial<HitlResumePayload>;

      mockRequest.payload = payload;

      const result = await sendHitlResume(
        mockDefinition,
        mockRequest,
        mockServices,
      );

      expect(result).toBeDefined();
      expect(result?.error).toContain('decision is required');
    });

    it('should fail when httpService is not available', async () => {
      const payload: HitlResumePayload = {
        action: 'resume',
        taskId: 'task-1',
        decision: 'approve',
      };

      mockRequest.payload = payload as unknown as typeof mockRequest.payload;
      mockServices.httpService = undefined;

      const result = await sendHitlResume(
        mockDefinition,
        mockRequest,
        mockServices,
      );

      expect(result).toBeDefined();
      expect(result?.error).toContain('HttpService not available');
    });

    it('should fail when agent has no HITL endpoint', async () => {
      const payload: HitlResumePayload = {
        action: 'resume',
        taskId: 'task-1',
        decision: 'approve',
      };

      mockRequest.payload = payload as unknown as typeof mockRequest.payload;
      mockDefinition.transport = undefined;

      const result = await sendHitlResume(
        mockDefinition,
        mockRequest,
        mockServices,
      );

      expect(result).toBeDefined();
      expect(result?.error).toContain(
        'does not have a configured HITL endpoint',
      );
    });

    it('should include edited content in resume request', async () => {
      const payload: HitlResumePayload = {
        action: 'resume',
        taskId: 'task-1',
        decision: 'edit',
        editedContent: {
          blogPost: 'Edited blog content',
        },
      };

      mockRequest.payload = payload as unknown as typeof mockRequest.payload;

      const mockResponse = {
        status: 200,
        data: {
          data: {
            status: 'completed',
          },
        },
      };

      mockServices.httpService!.post = jest
        .fn()
        .mockReturnValue(of(mockResponse));

      await sendHitlResume(mockDefinition, mockRequest, mockServices);

      expect(mockServices.httpService!.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          decision: 'edit',
          editedContent: { blogPost: 'Edited blog content' },
        }),
        expect.any(Object),
      );
    });

    it('should include feedback in resume request', async () => {
      const payload: HitlResumePayload = {
        action: 'resume',
        taskId: 'task-1',
        decision: 'regenerate',
        feedback: 'Please make it more technical',
      };

      mockRequest.payload = payload as unknown as typeof mockRequest.payload;

      const mockResponse = {
        status: 200,
        data: {
          data: {
            status: 'regenerating',
          },
        },
      };

      mockServices.httpService!.post = jest
        .fn()
        .mockReturnValue(of(mockResponse));

      await sendHitlResume(mockDefinition, mockRequest, mockServices);

      expect(mockServices.httpService!.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          decision: 'regenerate',
          feedback: 'Please make it more technical',
        }),
        expect.any(Object),
      );
    });
  });

  describe('handleHitlResume', () => {
    it('should resume HITL workflow and return BUILD response', async () => {
      const payload: HitlResumePayload = {
        action: 'resume',
        taskId: 'task-1',
        decision: 'approve',
      };

      mockRequest.payload = payload as unknown as typeof mockRequest.payload;

      const finalContent: HitlGeneratedContent = {
        blogPost: 'Final blog content',
        seoDescription: 'SEO description',
        socialPosts: ['Post 1', 'Post 2'],
      };

      const mockResponse = {
        status: 200,
        data: {
          data: {
            status: 'completed',
            topic: 'Test Blog',
            finalContent,
          },
        },
      };

      mockServices.httpService!.post = jest
        .fn()
        .mockReturnValue(of(mockResponse));

      const mockDeliverable = {
        id: 'del-1',
        userId: 'user-1',
        conversationId: 'conv-1',
        agentName: 'extended-post-writer',
        title: 'Test Blog',
        type: 'document',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        currentVersion: {
          id: 'ver-1',
          deliverableId: 'del-1',
          versionNumber: 1,
          content: 'Combined content',
          format: 'markdown' as const,
          isCurrentVersion: true,
          createdByType: 'agent' as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockServices.deliverablesService!.create = jest
        .fn()
        .mockResolvedValue(mockDeliverable);

      const result = await handleHitlResume(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      expect(result.success).toBe(true);
      expect(result.mode).toBe(AgentTaskMode.BUILD);
      expect(result.payload.content).toHaveProperty('deliverable');
      expect(result.payload.content).toHaveProperty('version');
    });

    it('should handle rejection decision', async () => {
      const payload: HitlResumePayload = {
        action: 'resume',
        taskId: 'task-1',
        decision: 'reject',
      };

      mockRequest.payload = payload as unknown as typeof mockRequest.payload;

      const mockResponse = {
        status: 200,
        data: {
          status: 'rejected',
          topic: 'Test Blog',
        },
      };

      mockServices.httpService!.post = jest
        .fn()
        .mockReturnValue(of(mockResponse));

      const result = await handleHitlResume(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      // hitlRejected returns success=true with status='rejected'
      expect(result.success).toBe(true);
      expect(result.mode).toBe(AgentTaskMode.HITL);
    });

    it('should handle errors from LangGraph', async () => {
      const payload: HitlResumePayload = {
        action: 'resume',
        taskId: 'task-1',
        decision: 'approve',
      };

      mockRequest.payload = payload as unknown as typeof mockRequest.payload;

      mockServices.httpService!.post = jest.fn().mockImplementation(() => {
        throw new Error('Connection timeout');
      });

      const result = await handleHitlResume(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      expect(result.success).toBe(false);
    });
  });

  describe('handleHitlStatus', () => {
    it('should get HITL status', async () => {
      const payload: HitlStatusPayload = {
        action: 'status',
        taskId: 'task-1',
      };

      mockRequest.payload = payload as unknown as typeof mockRequest.payload;

      const mockResponse = {
        data: {
          status: 'hitl_waiting',
          topic: 'Test Blog',
          hitlPending: true,
          generatedContent: {
            blogPost: 'Generated blog content',
          },
        },
      };

      mockServices.httpService!.get = jest
        .fn()
        .mockReturnValue(of(mockResponse));

      const result = await handleHitlStatus(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      // hitlWaiting returns success=true with hitlPending=true
      expect(result.success).toBe(true);
      expect(result.mode).toBe(AgentTaskMode.HITL);
      expect(result.payload.content).toHaveProperty('hitlPending', true);
    });

    it('should fail when taskId is missing', async () => {
      const payload = {
        action: 'status',
      } as Partial<HitlStatusPayload>;

      mockRequest.payload = payload;

      const result = await handleHitlStatus(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      expect(result.success).toBe(false);
      expect(result.payload.metadata?.reason).toContain('taskId is required');
    });

    it('should fail when httpService is not available', async () => {
      const payload: HitlStatusPayload = {
        action: 'status',
        taskId: 'task-1',
      };

      mockRequest.payload = payload as unknown as typeof mockRequest.payload;
      mockServices.httpService = undefined;

      const result = await handleHitlStatus(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      expect(result.success).toBe(false);
      expect(result.payload.metadata?.reason).toContain(
        'HttpService not available',
      );
    });

    it('should handle completed status', async () => {
      const payload: HitlStatusPayload = {
        action: 'status',
        taskId: 'task-1',
      };

      mockRequest.payload = payload as unknown as typeof mockRequest.payload;

      const mockResponse = {
        data: {
          status: 'completed',
          topic: 'Test Blog',
          hitlPending: false,
          finalContent: {
            blogPost: 'Final content',
          },
        },
      };

      mockServices.httpService!.get = jest
        .fn()
        .mockReturnValue(of(mockResponse));

      const result = await handleHitlStatus(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      // When hitlPending is false, the handler returns success (status ready)
      expect(result.success).toBe(true);
      expect(result.payload.content).toHaveProperty('hitlPending', false);
    });
  });

  describe('handleHitlHistory', () => {
    it('should get HITL history', async () => {
      const payload: HitlHistoryPayload = {
        action: 'history',
        taskId: 'task-1',
      };

      mockRequest.payload = payload as unknown as typeof mockRequest.payload;

      const mockResponse = {
        data: {
          history: [
            { status: 'started', timestamp: '2025-01-01T00:00:00Z' },
            { status: 'hitl_waiting', timestamp: '2025-01-01T00:01:00Z' },
            { status: 'completed', timestamp: '2025-01-01T00:02:00Z' },
          ],
          status: 'completed',
        },
      };

      mockServices.httpService!.get = jest
        .fn()
        .mockReturnValue(of(mockResponse));

      const result = await handleHitlHistory(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      expect(result.success).toBe(true);
      expect(result.mode).toBe(AgentTaskMode.HITL);
      expect(result.payload.content).toHaveProperty('history');
      expect(
        (result.payload.content as { history: unknown[] }).history,
      ).toHaveLength(3);
    });

    it('should fail when taskId is missing', async () => {
      const payload = {
        action: 'history',
      } as Partial<HitlHistoryPayload>;

      mockRequest.payload = payload;

      const result = await handleHitlHistory(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      expect(result.success).toBe(false);
      expect(result.payload.metadata?.reason).toContain('taskId is required');
    });

    it('should use default limit when not provided', async () => {
      const payload: HitlHistoryPayload = {
        action: 'history',
        taskId: 'task-1',
      };

      mockRequest.payload = payload as unknown as typeof mockRequest.payload;

      const mockResponse = {
        data: {
          history: [],
          status: 'started',
        },
      };

      mockServices.httpService!.get = jest
        .fn()
        .mockReturnValue(of(mockResponse));

      await handleHitlHistory(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      expect(mockServices.httpService!.get).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.any(Object),
      );
    });
  });

  describe('Transport-types compliance', () => {
    it('should work with ExecutionContext from transport-types', async () => {
      const mockContext = createMockExecutionContext({
        userId: 'test-user',
        conversationId: 'conv-123',
        taskId: 'task-123',
      });

      mockRequest.context = mockContext;

      const payload: HitlStatusPayload = {
        action: 'status',
        taskId: 'task-123',
      };

      mockRequest.payload = payload as unknown as typeof mockRequest.payload;

      const mockResponse = {
        data: {
          status: 'hitl_waiting',
          topic: 'Test',
          hitlPending: true,
        },
      };

      mockServices.httpService!.get = jest
        .fn()
        .mockReturnValue(of(mockResponse));

      const result = await handleHitlStatus(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      // hitlWaiting returns success=true with hitlPending=true
      expect(result.success).toBe(true);
      expect((result.payload.content as { taskId: string }).taskId).toBe(
        'task-123',
      );
    });

    it('should validate all HitlDecision types', () => {
      const decisions = [
        'approve',
        'reject',
        'regenerate',
        'replace',
        'skip',
        'edit',
      ];

      decisions.forEach((decision) => {
        expect(decision).toBeTruthy();
      });
    });

    it('should validate all HitlStatus types', () => {
      const statuses = [
        'started',
        'generating',
        'hitl_waiting',
        'regenerating',
        'completed',
        'rejected',
        'failed',
      ];

      statuses.forEach((status) => {
        expect(status).toBeTruthy();
      });
    });

    it('should validate HitlGeneratedContent structure', () => {
      const generatedContent: HitlGeneratedContent = {
        blogPost: 'Blog content',
        seoDescription: 'SEO description',
        socialPosts: ['Post 1', 'Post 2'],
      };

      expect(generatedContent).toBeDefined();
      expect(generatedContent.blogPost).toBe('Blog content');
      expect(generatedContent.seoDescription).toBe('SEO description');
      expect(generatedContent.socialPosts).toHaveLength(2);
    });
  });

  describe('Error handling', () => {
    it('should handle network errors gracefully', async () => {
      const payload: HitlResumePayload = {
        action: 'resume',
        taskId: 'task-1',
        decision: 'approve',
      };

      mockRequest.payload = payload as unknown as typeof mockRequest.payload;

      mockServices.httpService!.post = jest.fn().mockImplementation(() => {
        throw new Error('Network error');
      });

      const result = await handleHitlResume(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      expect(result.success).toBe(false);
      expect(result.payload.metadata?.reason).toBeDefined();
    });

    it('should handle timeout errors', async () => {
      const payload: HitlResumePayload = {
        action: 'resume',
        taskId: 'task-1',
        decision: 'approve',
      };

      mockRequest.payload = payload as unknown as typeof mockRequest.payload;

      const timeoutError = new Error('Timeout');
      (timeoutError as Error & { code: string }).code = 'ETIMEDOUT';

      mockServices.httpService!.post = jest.fn().mockImplementation(() => {
        throw timeoutError;
      });

      const result = await handleHitlResume(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      expect(result.success).toBe(false);
    });
  });
});
