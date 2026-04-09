import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { LlmAnalyticsController } from './llm-analytics.controller';
import { LlmAnalyticsService } from './llm-analytics.service';
import {
  applyRemoteAuthOverrides,
  makeJwtGuardReject,
  makeRbacGuardReject,
  resetAuthMocks,
  mockJwtAuthGuard,
  mockRbacGuard,
} from '@orchestratorai/auth-client';

const makeServiceMock = () => ({
  getUsage: jest.fn().mockResolvedValue([]),
  getModels: jest.fn().mockResolvedValue([]),
  getCosts: jest.fn().mockResolvedValue([]),
  createModel: jest.fn(),
  updateModel: jest.fn(),
  listUsage: jest.fn().mockResolvedValue([]),
  getUsageReasoning: jest.fn(),
});

describe('LlmAnalyticsController', () => {
  let controller: LlmAnalyticsController;
  let serviceMock: ReturnType<typeof makeServiceMock>;

  beforeEach(async () => {
    resetAuthMocks();
    serviceMock = makeServiceMock();

    const module: TestingModule = await applyRemoteAuthOverrides(
      Test.createTestingModule({
        controllers: [LlmAnalyticsController],
        providers: [
          {
            provide: LlmAnalyticsService,
            useValue: serviceMock,
          },
        ],
      }),
    ).compile();

    controller = module.get<LlmAnalyticsController>(LlmAnalyticsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // listUsage handler
  // ---------------------------------------------------------------------------

  describe('GET /admin/llm/usage/list', () => {
    it('calls service.listUsage with no filters when no query params provided', async () => {
      await controller.listUsage(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );

      expect(serviceMock.listUsage).toHaveBeenCalledWith({
        orgSlug: undefined,
        agentName: undefined,
        provider: undefined,
        model: undefined,
        from: undefined,
        to: undefined,
        hasReasoning: undefined,
        limit: undefined,
        offset: undefined,
      });
    });

    it('parses hasReasoning=true as boolean true', async () => {
      await controller.listUsage(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'true',
        undefined,
        undefined,
      );

      expect(serviceMock.listUsage).toHaveBeenCalledWith(
        expect.objectContaining({ hasReasoning: true }),
      );
    });

    it('parses hasReasoning=false as boolean false', async () => {
      await controller.listUsage(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'false',
        undefined,
        undefined,
      );

      expect(serviceMock.listUsage).toHaveBeenCalledWith(
        expect.objectContaining({ hasReasoning: false }),
      );
    });

    it('parses hasReasoning=other as undefined', async () => {
      await controller.listUsage(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'maybe',
        undefined,
        undefined,
      );

      expect(serviceMock.listUsage).toHaveBeenCalledWith(
        expect.objectContaining({ hasReasoning: undefined }),
      );
    });

    it('parses numeric limit and offset strings', async () => {
      await controller.listUsage(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        '25',
        '100',
      );

      expect(serviceMock.listUsage).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 25, offset: 100 }),
      );
    });

    it('forwards all string filters to service', async () => {
      await controller.listUsage(
        'my-org',
        'legal-department',
        'anthropic',
        'claude-sonnet-4',
        '2026-01-01',
        '2026-12-31',
        'true',
        '10',
        '0',
      );

      expect(serviceMock.listUsage).toHaveBeenCalledWith({
        orgSlug: 'my-org',
        agentName: 'legal-department',
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        from: '2026-01-01',
        to: '2026-12-31',
        hasReasoning: true,
        limit: 10,
        offset: 0,
      });
    });

    it('returns the array from service', async () => {
      const mockRows = [{ id: 'r1', hasReasoning: true } as never];
      serviceMock.listUsage.mockResolvedValueOnce(mockRows);

      const result = await controller.listUsage(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );

      expect(result).toBe(mockRows);
    });

    it('passes workflowSlug and nodeName from service rows through to caller', async () => {
      const mockRows = [
        {
          id: 'r1',
          agentName: 'legal-department:litigation-agent',
          workflowSlug: 'legal-department',
          nodeName: 'litigation-agent',
          hasReasoning: false,
        } as never,
      ];
      serviceMock.listUsage.mockResolvedValueOnce(mockRows);

      const result = await controller.listUsage(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );

      expect(result[0]).toMatchObject({
        workflowSlug: 'legal-department',
        nodeName: 'litigation-agent',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // getUsageReasoning handler
  // ---------------------------------------------------------------------------

  describe('GET /admin/llm/usage/:id/reasoning', () => {
    it('delegates to service.getUsageReasoning with the path param id', async () => {
      const payload = {
        thinkingContent: 'The reasoning was...',
        thinkingDurationMs: 900,
        thinkingTokenCount: 200,
      };
      serviceMock.getUsageReasoning.mockResolvedValueOnce(payload);

      const result = await controller.getUsageReasoning('row-uuid-1');

      expect(serviceMock.getUsageReasoning).toHaveBeenCalledWith('row-uuid-1');
      expect(result).toBe(payload);
    });

    it('propagates NotFoundException from service', async () => {
      serviceMock.getUsageReasoning.mockRejectedValueOnce(
        new NotFoundException('llm_usage row missing-id not found'),
      );

      await expect(controller.getUsageReasoning('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Guard stack — verifies mock helper wiring so future regressions surface
  // ---------------------------------------------------------------------------
  describe('guard stack', () => {
    it('makeJwtGuardReject causes the next canActivate to throw Unauthorized', () => {
      makeJwtGuardReject();
      expect(() => mockJwtAuthGuard.canActivate({} as never)).toThrow(
        UnauthorizedException,
      );
    });

    it('makeRbacGuardReject causes the next canActivate to throw Forbidden', () => {
      makeRbacGuardReject();
      expect(() => mockRbacGuard.canActivate({} as never)).toThrow(
        ForbiddenException,
      );
    });
  });
});
