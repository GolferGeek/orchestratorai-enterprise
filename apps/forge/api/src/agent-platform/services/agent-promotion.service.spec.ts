import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { AgentPromotionService } from './agent-promotion.service';
import { AgentsRepository } from '../repositories/agents.repository';
import { HumanApprovalsRepository } from '../repositories/human-approvals.repository';
import { AgentValidationService } from './agent-validation.service';
import { AgentPolicyService } from './agent-policy.service';

describe('AgentPromotionService', () => {
  let service: AgentPromotionService;
  let agentsRepo: jest.Mocked<AgentsRepository>;
  let approvalsRepo: jest.Mocked<HumanApprovalsRepository>;
  let validator: jest.Mocked<AgentValidationService>;

  beforeEach(async () => {
    const mockAgentsRepo = {
      findBySlug: jest.fn(),
      updateMetadata: jest.fn(),
    };

    const mockApprovalsRepo = {
      create: jest.fn(),
      get: jest.fn(),
      setStatus: jest.fn(),
    };

    const mockValidator = {
      validateByType: jest.fn().mockReturnValue({ ok: true, issues: [] }),
    };

    const mockPolicy = {
      check: jest.fn().mockReturnValue([]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentPromotionService,
        { provide: AgentsRepository, useValue: mockAgentsRepo },
        { provide: HumanApprovalsRepository, useValue: mockApprovalsRepo },
        { provide: AgentValidationService, useValue: mockValidator },
        { provide: AgentPolicyService, useValue: mockPolicy },
      ],
    }).compile();

    service = moduleRef.get<AgentPromotionService>(AgentPromotionService);
    agentsRepo = moduleRef.get(AgentsRepository);
    approvalsRepo = moduleRef.get(HumanApprovalsRepository);
    validator = moduleRef.get(AgentValidationService);
  });

  describe('requestPromotion', () => {
    it('should auto-promote simple context agent without approval', async () => {
      const agent = {
        id: 'agent-1',
        slug: 'simple-context',
        agent_type: 'context',
        status: 'draft',
        organization_slug: ['my-org'],
        name: 'Simple Context Agent',
        capabilities: [],
        metadata: { status: 'draft' },
      };

      (agentsRepo.findBySlug as jest.Mock).mockResolvedValue(agent);
      (agentsRepo.updateMetadata as jest.Mock).mockResolvedValue({
        ...agent,
        metadata: { status: 'active' },
      });

      const result = await service.requestPromotion('simple-context');

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('active');
      expect(result.requiresApproval).toBeUndefined();

      expect(agentsRepo.updateMetadata).toHaveBeenCalledWith('simple-context', {
        status: 'active',
      });
    });

    it('should require approval for api agent', async () => {
      const agent = {
        id: 'agent-2',
        slug: 'api-agent',
        agent_type: 'api',
        status: 'draft',
        organization_slug: ['my-org'],
        name: 'API Agent',
        capabilities: [],
        metadata: { status: 'draft' },
      };

      (agentsRepo.findBySlug as jest.Mock).mockResolvedValue(agent);
      (approvalsRepo.create as jest.Mock).mockResolvedValue({
        id: 'approval-1',
        agent_slug: agent.slug,
        status: 'pending',
      });

      const result = await service.requestPromotion('api-agent', {
        requestedBy: 'user-123',
      });

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('draft'); // Still draft, pending approval
      expect(result.requiresApproval).toBe(true);
      expect(result.approvalId).toBe('approval-1');

      expect(approvalsRepo.create).toHaveBeenCalled();

      expect(agentsRepo.updateMetadata).not.toHaveBeenCalled();
    });

    it('should require approval for external agent', async () => {
      const agent = {
        id: 'agent-3',
        slug: 'external-agent',
        agent_type: 'external',
        status: 'draft',
        organization_slug: ['my-org'],
        name: 'External Agent',
        capabilities: [],
        metadata: { status: 'draft' },
      };

      (agentsRepo.findBySlug as jest.Mock).mockResolvedValue(agent);
      approvalsRepo.create.mockResolvedValue({
        id: 'approval-2',
        agent_slug: agent.slug,
        status: 'pending',
      } as never);

      const result = await service.requestPromotion('external-agent');

      expect(result.requiresApproval).toBe(true);

      expect(approvalsRepo.create).toHaveBeenCalled();
    });

    it('should fail if agent is already active', async () => {
      const agent = {
        id: 'agent-4',
        slug: 'already-active',
        agent_type: 'context',
        status: 'active',
        capabilities: [],
        metadata: { status: 'active' },
      };

      (agentsRepo.findBySlug as jest.Mock).mockResolvedValue(agent);

      const result = await service.requestPromotion('already-active');

      expect(result.success).toBe(false);
      expect(result.error).toContain('already active');
    });

    it('should fail validation and return errors', async () => {
      const agent = {
        id: 'agent-5',
        slug: 'invalid-agent',
        agent_type: 'context',
        status: 'draft',
        capabilities: [],
        metadata: { status: 'draft' },
      };

      (agentsRepo.findBySlug as jest.Mock).mockResolvedValue(agent);
      validator.validateByType.mockReturnValue({
        ok: false,
        issues: [{ message: 'Missing required field' }],
      });

      const result = await service.requestPromotion('invalid-agent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required field');
    });

    it('should skip validation when requested', async () => {
      const agent = {
        id: 'agent-6',
        slug: 'skip-validation',
        agent_type: 'context',
        status: 'draft',
        capabilities: [],
        metadata: { status: 'draft' },
      };

      (agentsRepo.findBySlug as jest.Mock).mockResolvedValue(agent);
      (agentsRepo.updateMetadata as jest.Mock).mockResolvedValue({
        ...agent,
        metadata: { status: 'active' },
      });

      await service.requestPromotion('skip-validation', {
        skipValidation: true,
      });

      expect(validator.validateByType).not.toHaveBeenCalled();

      expect(agentsRepo.updateMetadata).toHaveBeenCalled();
    });
  });

  describe('completePromotionAfterApproval', () => {
    it('should promote agent after approval', async () => {
      const approval = {
        id: 'approval-1',
        status: 'approved',
        mode: 'agent_promotion',
        approved_by: 'user-123',
        metadata: { agentId: 'test-agent' },
      };

      const agent = {
        id: 'agent-1',
        slug: 'test-agent',
        status: 'draft',
        capabilities: [],
        metadata: { status: 'draft' },
      };

      (approvalsRepo.get as jest.Mock).mockResolvedValue(approval);
      (agentsRepo.findBySlug as jest.Mock).mockResolvedValue(agent);
      (agentsRepo.updateMetadata as jest.Mock).mockResolvedValue({
        ...agent,
        metadata: { status: 'active' },
      });

      const result = await service.completePromotionAfterApproval('approval-1');

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('active');

      expect(agentsRepo.updateMetadata).toHaveBeenCalledWith('test-agent', {
        status: 'active',
      });
    });

    it('should fail if approval is not approved', async () => {
      const approval = {
        id: 'approval-2',
        status: 'pending',
        mode: 'agent_promotion',
        metadata: { agentId: 'agent-2' },
      };

      (approvalsRepo.get as jest.Mock).mockResolvedValue(approval);

      await expect(
        service.completePromotionAfterApproval('approval-2'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('demote', () => {
    it('should demote active agent to draft', async () => {
      const agent = {
        id: 'agent-7',
        slug: 'active-agent',
        status: 'active',
        capabilities: [],
        metadata: { status: 'active' },
      };

      (agentsRepo.findBySlug as jest.Mock).mockResolvedValue(agent);
      (agentsRepo.updateMetadata as jest.Mock).mockResolvedValue({
        ...agent,
        metadata: { status: 'draft' },
      });

      const result = await service.demote('active-agent', 'Needs fixes');

      expect(result.success).toBe(true);
      expect(result.previousStatus).toBe('active');
      expect(result.newStatus).toBe('draft');

      expect(agentsRepo.updateMetadata).toHaveBeenCalledWith('active-agent', {
        status: 'draft',
      });
    });

    it('should fail if agent is not active', async () => {
      const agent = {
        id: 'agent-8',
        slug: 'draft-agent',
        status: 'draft',
        capabilities: [],
        metadata: { status: 'draft' },
      };

      (agentsRepo.findBySlug as jest.Mock).mockResolvedValue(agent);

      const result = await service.demote('draft-agent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not active');
    });
  });

  describe('archive', () => {
    it('should archive an agent', async () => {
      const agent = {
        id: 'agent-9',
        slug: 'to-archive',
        status: 'active',
        capabilities: [],
        metadata: { status: 'active' },
      };

      (agentsRepo.findBySlug as jest.Mock).mockResolvedValue(agent);
      (agentsRepo.updateMetadata as jest.Mock).mockResolvedValue({
        ...agent,
        metadata: { status: 'archived' },
      });

      const result = await service.archive('to-archive', 'No longer needed');

      expect(result.success).toBe(true);
      expect(result.previousStatus).toBe('active');
      expect(result.newStatus).toBe('archived');
    });
  });

  describe('getPromotionRequirements', () => {
    it('should return requirements for api agent', async () => {
      const agent = {
        id: 'agent-10',
        slug: 'api-agent',
        agent_type: 'api',
        capabilities: [],
        metadata: {},
      };

      (agentsRepo.findBySlug as jest.Mock).mockResolvedValue(agent);

      const requirements = await service.getPromotionRequirements('api-agent');

      expect(requirements.requiresValidation).toBe(true);
      expect(requirements.requiresDryRun).toBe(true);
    });

    it('should indicate approval requirement for agent with orchestrate capability', async () => {
      const agent = {
        id: 'agent-11',
        slug: 'orchestrator-agent',
        agent_type: 'context',
        capabilities: ['orchestrate'],
        metadata: {},
      };

      (agentsRepo.findBySlug as jest.Mock).mockResolvedValue(agent);

      const requirements =
        await service.getPromotionRequirements('orchestrator-agent');

      expect(requirements.requiresApproval).toBe(true);
    });
  });
});
