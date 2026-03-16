import { Test, TestingModule } from '@nestjs/testing';
import {
  PlanEngineService,
  GeneratePlanInput,
  UpdatePlanStatusInput,
} from './plan-engine.service';
import { ConversationPlansRepository } from '../repositories/conversation-plans.repository';
import { AgentRuntimeExecutionService } from './agent-runtime-execution.service';
import { ConversationPlanRecord } from '../interfaces/conversation-plan-record.interface';

describe('PlanEngineService', () => {
  let service: PlanEngineService;
  let mockPlansRepository: jest.Mocked<ConversationPlansRepository>;
  let mockRuntimeExecution: jest.Mocked<AgentRuntimeExecutionService>;

  const mockPlanRecord: ConversationPlanRecord = {
    id: 'plan-1',
    conversation_id: 'conv-1',
    organization_slug: 'test-org',
    agent_slug: 'test-agent',
    version: 1,
    status: 'draft',
    summary: 'Test plan',
    plan_json: { phases: [], _meta: { agent: {} } },
    created_by: 'user-1',
    approved_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    mockPlansRepository = {
      createDraft: jest.fn(),
      updateStatus: jest.fn(),
      getById: jest.fn(),
      listByConversation: jest.fn(),
    } as unknown as jest.Mocked<ConversationPlansRepository>;

    mockRuntimeExecution = {
      enrichPlanDraft: jest.fn(),
    } as unknown as jest.Mocked<AgentRuntimeExecutionService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanEngineService,
        { provide: ConversationPlansRepository, useValue: mockPlansRepository },
        {
          provide: AgentRuntimeExecutionService,
          useValue: mockRuntimeExecution,
        },
      ],
    }).compile();

    service = module.get<PlanEngineService>(PlanEngineService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('generateDraft', () => {
    it('should generate a plan draft with agent metadata', async () => {
      const input: GeneratePlanInput = {
        conversationId: 'conv-1',
        organizationSlug: 'test-org',
        agentSlug: 'test-agent',
        summary: 'Test summary',
        draftPlan: { phases: ['phase1', 'phase2'] },
        createdBy: 'user-1',
      };

      const enrichedPlan = {
        phases: ['phase1', 'phase2'],
        _meta: { agent: {} },
      };
      mockRuntimeExecution.enrichPlanDraft.mockReturnValue(enrichedPlan);
      mockPlansRepository.createDraft.mockResolvedValue(mockPlanRecord);

      const result = await service.generateDraft(input);

      expect(mockRuntimeExecution.enrichPlanDraft).toHaveBeenCalledWith(
        input.draftPlan,
        expect.objectContaining({
          slug: 'test-agent',
          organizationSlug: 'test-org',
        }),
      );
      expect(mockPlansRepository.createDraft).toHaveBeenCalledWith({
        conversation_id: 'conv-1',
        organization_slug: 'test-org',
        agent_slug: 'test-agent',
        summary: 'Test summary',
        plan_json: enrichedPlan,
        created_by: 'user-1',
      });
      expect(result).toEqual(mockPlanRecord);
    });

    it('should generate draft with provided agent metadata', async () => {
      const agentMetadata = {
        id: 'agent-1',
        slug: 'test-agent',
        displayName: 'Test Agent',
        type: 'context' as const,
        organizationSlug: 'test-org',
      };

      const input: GeneratePlanInput = {
        conversationId: 'conv-1',
        organizationSlug: 'test-org',
        agentSlug: 'test-agent',
        draftPlan: { phases: [] },
        agentMetadata,
      };

      const enrichedPlan = { phases: [], _meta: { agent: agentMetadata } };
      mockRuntimeExecution.enrichPlanDraft.mockReturnValue(enrichedPlan);
      mockPlansRepository.createDraft.mockResolvedValue(mockPlanRecord);

      await service.generateDraft(input);

      expect(mockRuntimeExecution.enrichPlanDraft).toHaveBeenCalledWith(
        input.draftPlan,
        agentMetadata,
      );
    });

    it('should handle null organization slug', async () => {
      const input: GeneratePlanInput = {
        conversationId: 'conv-1',
        organizationSlug: null,
        agentSlug: 'global-agent',
        draftPlan: { phases: [] },
      };

      const enrichedPlan = { phases: [], _meta: {} };
      mockRuntimeExecution.enrichPlanDraft.mockReturnValue(enrichedPlan);
      mockPlansRepository.createDraft.mockResolvedValue({
        ...mockPlanRecord,
        organization_slug: null,
      });

      const result = await service.generateDraft(input);

      expect(mockPlansRepository.createDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          organization_slug: null,
        }),
      );
      expect(result.organization_slug).toBeNull();
    });

    it('should handle missing optional fields', async () => {
      const input: GeneratePlanInput = {
        conversationId: 'conv-1',
        organizationSlug: 'test-org',
        agentSlug: 'test-agent',
        draftPlan: { phases: [] },
      };

      const enrichedPlan = { phases: [], _meta: {} };
      mockRuntimeExecution.enrichPlanDraft.mockReturnValue(enrichedPlan);
      mockPlansRepository.createDraft.mockResolvedValue(mockPlanRecord);

      await service.generateDraft(input);

      expect(mockPlansRepository.createDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: null,
          created_by: null,
        }),
      );
    });
  });

  describe('updateStatus', () => {
    it('should update plan status', async () => {
      const input: UpdatePlanStatusInput = {
        planId: 'plan-1',
        status: 'approved',
        summary: 'Updated summary',
        approvedBy: 'manager-1',
      };

      const updatedPlan = { ...mockPlanRecord, status: 'approved' };
      mockPlansRepository.updateStatus.mockResolvedValue(updatedPlan);

      const result = await service.updateStatus(input);

      expect(mockPlansRepository.updateStatus).toHaveBeenCalledWith('plan-1', {
        status: 'approved',
        summary: 'Updated summary',
        approved_by: 'manager-1',
      });
      expect(result).toEqual(updatedPlan);
    });

    it('should update status with updated plan JSON', async () => {
      const updatedPlanJson = { phases: ['updated'], _meta: {} };
      const input: UpdatePlanStatusInput = {
        planId: 'plan-1',
        status: 'revised',
        updatedPlan: updatedPlanJson,
      };

      const updatedPlan = { ...mockPlanRecord, plan_json: updatedPlanJson };
      mockPlansRepository.updateStatus.mockResolvedValue(updatedPlan);

      const result = await service.updateStatus(input);

      expect(mockPlansRepository.updateStatus).toHaveBeenCalledWith('plan-1', {
        status: 'revised',
        plan_json: updatedPlanJson,
      });
      expect(result.plan_json).toEqual(updatedPlanJson);
    });

    it('should update status with minimal data', async () => {
      const input: UpdatePlanStatusInput = {
        planId: 'plan-1',
        status: 'rejected',
      };

      mockPlansRepository.updateStatus.mockResolvedValue({
        ...mockPlanRecord,
        status: 'rejected',
      });

      await service.updateStatus(input);

      expect(mockPlansRepository.updateStatus).toHaveBeenCalledWith('plan-1', {
        status: 'rejected',
      });
    });
  });

  describe('getPlan', () => {
    it('should retrieve a plan by id', async () => {
      mockPlansRepository.getById.mockResolvedValue(mockPlanRecord);

      const result = await service.getPlan('plan-1');

      expect(mockPlansRepository.getById).toHaveBeenCalledWith('plan-1');
      expect(result).toEqual(mockPlanRecord);
    });

    it('should return null when plan not found', async () => {
      mockPlansRepository.getById.mockResolvedValue(null);

      const result = await service.getPlan('non-existent');

      expect(mockPlansRepository.getById).toHaveBeenCalledWith('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('listPlans', () => {
    it('should list plans for a conversation', async () => {
      const plans = [mockPlanRecord, { ...mockPlanRecord, id: 'plan-2' }];
      mockPlansRepository.listByConversation.mockResolvedValue(plans);

      const result = await service.listPlans('conv-1');

      expect(mockPlansRepository.listByConversation).toHaveBeenCalledWith(
        'conv-1',
      );
      expect(result).toEqual(plans);
    });

    it('should return empty array when no plans found', async () => {
      mockPlansRepository.listByConversation.mockResolvedValue([]);

      const result = await service.listPlans('conv-empty');

      expect(result).toEqual([]);
    });
  });
});
