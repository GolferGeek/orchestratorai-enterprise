import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PlanVersionsService } from './plan-versions.service';
import {
  PlanVersionsRepository,
  PlanVersionRecord,
} from '../repositories/plan-versions.repository';
import { PlansRepository, PlanRecord } from '../repositories/plans.repository';
import { LLMService } from '@/llms/llm.service';
import { LLM_SERVICE } from '@/planes/llm/llm.interface';
import { TasksService } from '@/agent2agent/tasks/tasks.service';
import { NIL_UUID } from '@orchestrator-ai/transport-types';

describe('PlanVersionsService', () => {
  let service: PlanVersionsService;
  let versionsRepo: jest.Mocked<PlanVersionsRepository>;
  let plansRepo: jest.Mocked<PlansRepository>;
  let llmService: jest.Mocked<LLMService>;
  let tasksService: jest.Mocked<TasksService>;

  const mockExecutionContext = {
    userId: '550e8400-e29b-41d4-a716-446655440000',
    conversationId: '550e8400-e29b-41d4-a716-446655440001',
    taskId: 'task-123',
    agentSlug: 'test-agent',
    orgSlug: 'test-org',
    agentType: 'context',
    provider: 'anthropic',
    model: 'claude-3-sonnet',
    planId: '550e8400-e29b-41d4-a716-446655440002',
    deliverableId: NIL_UUID,
  };

  const mockPlanRecord: PlanRecord = {
    id: '550e8400-e29b-41d4-a716-446655440002',
    conversation_id: '550e8400-e29b-41d4-a716-446655440001',
    user_id: '550e8400-e29b-41d4-a716-446655440000',
    agent_name: 'test-agent',
    organization: 'test-org',
    title: 'Test Plan',
    current_version_id: 'version-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockVersionRecord: PlanVersionRecord = {
    id: 'version-1',
    plan_id: '550e8400-e29b-41d4-a716-446655440002',
    version_number: 1,
    content: '# Test Plan Content',
    format: 'markdown',
    created_by_type: 'user',
    created_by_id: '550e8400-e29b-41d4-a716-446655440000',
    task_id: 'task-123',
    metadata: {},
    is_current_version: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanVersionsService,
        {
          provide: PlanVersionsRepository,
          useValue: {
            create: jest.fn(),
            findById: jest.fn(),
            findByPlanId: jest.fn(),
            getCurrentVersion: jest.fn(),
            getNextVersionNumber: jest.fn(),
            markAllAsNotCurrent: jest.fn(),
            markAsCurrent: jest.fn(),
            deleteVersion: jest.fn(),
          },
        },
        {
          provide: PlansRepository,
          useValue: {
            findById: jest.fn(),
            setCurrentVersion: jest.fn(),
          },
        },
        {
          provide: LLM_SERVICE,
          useValue: {
            generateUnifiedResponse: jest.fn(),
          },
        },
        {
          provide: TasksService,
          useValue: {
            getTaskById: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PlanVersionsService>(PlanVersionsService);
    versionsRepo = module.get(PlanVersionsRepository);
    plansRepo = module.get(PlansRepository);
    llmService = module.get(LLM_SERVICE);
    tasksService = module.get(TasksService);
  });

  describe('createVersion', () => {
    it('should create a new version successfully', async () => {
      plansRepo.findById.mockResolvedValue(mockPlanRecord);
      versionsRepo.getNextVersionNumber.mockResolvedValue(2);
      versionsRepo.markAllAsNotCurrent.mockResolvedValue(undefined);
      versionsRepo.create.mockResolvedValue({
        ...mockVersionRecord,
        id: 'version-2',
        version_number: 2,
      });
      plansRepo.setCurrentVersion.mockResolvedValue(mockPlanRecord);

      const result = await service.createVersion(mockExecutionContext, {
        content: '# New Content',
        format: 'markdown',
        createdByType: 'user',
      });

      expect(result.versionNumber).toBe(2);
      expect(result.content).toBe('# Test Plan Content');
      expect(versionsRepo.markAllAsNotCurrent).toHaveBeenCalledWith(
        mockExecutionContext.planId,
      );
    });

    it('should throw NotFoundException when plan does not exist', async () => {
      plansRepo.findById.mockResolvedValue(null);

      await expect(
        service.createVersion(mockExecutionContext, {
          content: '# Content',
          format: 'markdown',
          createdByType: 'user',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should include taskId when provided', async () => {
      plansRepo.findById.mockResolvedValue(mockPlanRecord);
      versionsRepo.getNextVersionNumber.mockResolvedValue(1);
      versionsRepo.markAllAsNotCurrent.mockResolvedValue(undefined);
      versionsRepo.create.mockResolvedValue(mockVersionRecord);
      plansRepo.setCurrentVersion.mockResolvedValue(mockPlanRecord);

      await service.createVersion(mockExecutionContext, {
        content: '# Content',
        format: 'markdown',
        createdByType: 'agent',
        taskId: 'task-456',
      });

      expect(versionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          task_id: 'task-456',
        }),
      );
    });

    it('should include metadata when provided', async () => {
      plansRepo.findById.mockResolvedValue(mockPlanRecord);
      versionsRepo.getNextVersionNumber.mockResolvedValue(1);
      versionsRepo.markAllAsNotCurrent.mockResolvedValue(undefined);
      versionsRepo.create.mockResolvedValue(mockVersionRecord);
      plansRepo.setCurrentVersion.mockResolvedValue(mockPlanRecord);

      await service.createVersion(mockExecutionContext, {
        content: '# Content',
        format: 'markdown',
        createdByType: 'user',
        metadata: { source: 'test' },
      });

      expect(versionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { source: 'test' },
        }),
      );
    });
  });

  describe('getCurrentVersion', () => {
    it('should return current version when it exists', async () => {
      plansRepo.findById.mockResolvedValue(mockPlanRecord);
      versionsRepo.getCurrentVersion.mockResolvedValue(mockVersionRecord);

      const result = await service.getCurrentVersion(mockExecutionContext);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('version-1');
      expect(result!.isCurrentVersion).toBe(true);
    });

    it('should return null when no current version exists', async () => {
      plansRepo.findById.mockResolvedValue(mockPlanRecord);
      versionsRepo.getCurrentVersion.mockResolvedValue(null);

      const result = await service.getCurrentVersion(mockExecutionContext);

      expect(result).toBeNull();
    });

    it('should throw NotFoundException when plan does not exist', async () => {
      plansRepo.findById.mockResolvedValue(null);

      await expect(
        service.getCurrentVersion(mockExecutionContext),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getVersionHistory', () => {
    it('should return all versions for a plan', async () => {
      plansRepo.findById.mockResolvedValue(mockPlanRecord);
      versionsRepo.findByPlanId.mockResolvedValue([
        mockVersionRecord,
        {
          ...mockVersionRecord,
          id: 'version-2',
          version_number: 2,
          is_current_version: false,
        },
      ]);

      const result = await service.getVersionHistory(mockExecutionContext);

      expect(result).toHaveLength(2);
      expect(result[0]!.versionNumber).toBe(1);
      expect(result[1]!.versionNumber).toBe(2);
    });

    it('should return empty array when no versions exist', async () => {
      plansRepo.findById.mockResolvedValue(mockPlanRecord);
      versionsRepo.findByPlanId.mockResolvedValue([]);

      const result = await service.getVersionHistory(mockExecutionContext);

      expect(result).toHaveLength(0);
    });

    it('should throw NotFoundException when plan does not exist', async () => {
      plansRepo.findById.mockResolvedValue(null);

      await expect(
        service.getVersionHistory(mockExecutionContext),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('should return version when it exists and user owns the plan', async () => {
      versionsRepo.findById.mockResolvedValue(mockVersionRecord);
      plansRepo.findById.mockResolvedValue(mockPlanRecord);

      const result = await service.findOne('version-1', mockExecutionContext);

      expect(result.id).toBe('version-1');
      expect(result.planId).toBe(mockExecutionContext.planId);
    });

    it('should throw NotFoundException when version does not exist', async () => {
      versionsRepo.findById.mockResolvedValue(null);

      await expect(
        service.findOne('non-existent', mockExecutionContext),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when user does not own the plan', async () => {
      versionsRepo.findById.mockResolvedValue(mockVersionRecord);
      plansRepo.findById.mockResolvedValue(null);

      await expect(
        service.findOne('version-1', mockExecutionContext),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should create a new version with updated content', async () => {
      versionsRepo.findById.mockResolvedValue(mockVersionRecord);
      plansRepo.findById.mockResolvedValue(mockPlanRecord);
      versionsRepo.getNextVersionNumber.mockResolvedValue(2);
      versionsRepo.markAllAsNotCurrent.mockResolvedValue(undefined);
      versionsRepo.create.mockResolvedValue({
        ...mockVersionRecord,
        id: 'version-2',
        version_number: 2,
        content: '# Updated Content',
      });
      plansRepo.setCurrentVersion.mockResolvedValue(mockPlanRecord);

      const result = await service.update(
        'version-1',
        mockExecutionContext,
        '# Updated Content',
      );

      expect(result.versionNumber).toBe(2);
      expect(versionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          content: '# Updated Content',
          created_by_type: 'user',
        }),
      );
    });

    it('should include edit metadata in new version', async () => {
      versionsRepo.findById.mockResolvedValue(mockVersionRecord);
      plansRepo.findById.mockResolvedValue(mockPlanRecord);
      versionsRepo.getNextVersionNumber.mockResolvedValue(2);
      versionsRepo.markAllAsNotCurrent.mockResolvedValue(undefined);
      versionsRepo.create.mockResolvedValue({
        ...mockVersionRecord,
        id: 'version-2',
        version_number: 2,
      });
      plansRepo.setCurrentVersion.mockResolvedValue(mockPlanRecord);

      await service.update('version-1', mockExecutionContext, '# Updated');

      expect(versionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            editedFromVersionId: 'version-1',
          }),
        }),
      );
    });
  });

  describe('setCurrentVersion', () => {
    it('should set a version as current', async () => {
      versionsRepo.findById.mockResolvedValue(mockVersionRecord);
      plansRepo.findById.mockResolvedValue(mockPlanRecord);
      versionsRepo.markAllAsNotCurrent.mockResolvedValue(undefined);
      versionsRepo.markAsCurrent.mockResolvedValue({
        ...mockVersionRecord,
        is_current_version: true,
      });
      plansRepo.setCurrentVersion.mockResolvedValue(mockPlanRecord);

      const result = await service.setCurrentVersion(
        'version-1',
        mockExecutionContext,
      );

      expect(result.isCurrentVersion).toBe(true);
      expect(versionsRepo.markAllAsNotCurrent).toHaveBeenCalled();
      expect(versionsRepo.markAsCurrent).toHaveBeenCalledWith('version-1');
    });

    it('should update plan current_version_id', async () => {
      versionsRepo.findById.mockResolvedValue(mockVersionRecord);
      plansRepo.findById.mockResolvedValue(mockPlanRecord);
      versionsRepo.markAllAsNotCurrent.mockResolvedValue(undefined);
      versionsRepo.markAsCurrent.mockResolvedValue(mockVersionRecord);
      plansRepo.setCurrentVersion.mockResolvedValue(mockPlanRecord);

      await service.setCurrentVersion('version-1', mockExecutionContext);

      expect(plansRepo.setCurrentVersion).toHaveBeenCalledWith(
        mockVersionRecord.plan_id,
        mockExecutionContext.userId,
        'version-1',
      );
    });
  });

  describe('copyVersion', () => {
    it('should create a copy of an existing version', async () => {
      versionsRepo.findById.mockResolvedValue(mockVersionRecord);
      plansRepo.findById.mockResolvedValue(mockPlanRecord);
      versionsRepo.getNextVersionNumber.mockResolvedValue(2);
      versionsRepo.markAllAsNotCurrent.mockResolvedValue(undefined);
      versionsRepo.create.mockResolvedValue({
        ...mockVersionRecord,
        id: 'version-2',
        version_number: 2,
      });
      plansRepo.setCurrentVersion.mockResolvedValue(mockPlanRecord);

      const result = await service.copyVersion(
        'version-1',
        mockExecutionContext,
      );

      expect(result.versionNumber).toBe(2);
      expect(versionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          content: mockVersionRecord.content,
          metadata: expect.objectContaining({
            copiedFromVersionId: 'version-1',
          }),
        }),
      );
    });
  });

  describe('deleteVersion', () => {
    it('should delete a non-current version', async () => {
      const nonCurrentVersion = {
        ...mockVersionRecord,
        is_current_version: false,
      };
      versionsRepo.findById.mockResolvedValue(nonCurrentVersion);
      plansRepo.findById.mockResolvedValue(mockPlanRecord);
      versionsRepo.deleteVersion.mockResolvedValue(undefined);

      const result = await service.deleteVersion(
        'version-1',
        mockExecutionContext,
      );

      expect(result.success).toBe(true);
      expect(versionsRepo.deleteVersion).toHaveBeenCalledWith('version-1');
    });

    it('should not delete current version', async () => {
      versionsRepo.findById.mockResolvedValue(mockVersionRecord);
      plansRepo.findById.mockResolvedValue(mockPlanRecord);

      const result = await service.deleteVersion(
        'version-1',
        mockExecutionContext,
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Cannot delete the current version');
      expect(versionsRepo.deleteVersion).not.toHaveBeenCalled();
    });
  });

  describe('mergeVersions', () => {
    const mockVersion1 = { ...mockVersionRecord, id: 'v1', version_number: 1 };
    const mockVersion2 = {
      ...mockVersionRecord,
      id: 'v2',
      version_number: 2,
      is_current_version: false,
    };

    beforeEach(() => {
      plansRepo.findById.mockResolvedValue(mockPlanRecord);
    });

    it('should merge two versions using LLM', async () => {
      versionsRepo.findById.mockImplementation(async (id: string) => {
        if (id === 'v1') return mockVersion1;
        if (id === 'v2') return mockVersion2;
        return null;
      });
      llmService.generateUnifiedResponse.mockResolvedValue({
        content: '# Merged Content',
        metadata: {
          provider: 'anthropic',
          model: 'claude-3-sonnet',
        } as any,
      });
      versionsRepo.getNextVersionNumber.mockResolvedValue(3);
      versionsRepo.markAllAsNotCurrent.mockResolvedValue(undefined);
      versionsRepo.create.mockResolvedValue({
        ...mockVersionRecord,
        id: 'v3',
        version_number: 3,
        content: '# Merged Content',
      });
      plansRepo.setCurrentVersion.mockResolvedValue(mockPlanRecord);

      const result = await service.mergeVersions(
        mockExecutionContext,
        ['v1', 'v2'],
        'Merge these plans',
      );

      expect(result.newVersion).toBeDefined();
      expect(result.conflictSummary).toContain('Merged 2 versions');
      expect(llmService.generateUnifiedResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            executionContext: mockExecutionContext,
            callerType: 'plan_merge',
          }),
        }),
      );
    });

    it('should throw BadRequestException with fewer than 2 versions', async () => {
      await expect(
        service.mergeVersions(mockExecutionContext, ['v1'], 'Merge'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when plan does not exist', async () => {
      plansRepo.findById.mockResolvedValue(null);

      await expect(
        service.mergeVersions(mockExecutionContext, ['v1', 'v2'], 'Merge'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when versions belong to different plans', async () => {
      versionsRepo.findById.mockImplementation(async (id: string) => {
        if (id === 'v1') return mockVersion1;
        if (id === 'v2')
          return { ...mockVersion2, plan_id: 'different-plan-id' };
        return null;
      });

      await expect(
        service.mergeVersions(mockExecutionContext, ['v1', 'v2'], 'Merge'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should pass ExecutionContext to LLM service', async () => {
      versionsRepo.findById.mockImplementation(async (id: string) => {
        if (id === 'v1') return mockVersion1;
        if (id === 'v2') return mockVersion2;
        return null;
      });
      llmService.generateUnifiedResponse.mockResolvedValue('# Merged');
      versionsRepo.getNextVersionNumber.mockResolvedValue(3);
      versionsRepo.markAllAsNotCurrent.mockResolvedValue(undefined);
      versionsRepo.create.mockResolvedValue({
        ...mockVersionRecord,
        id: 'v3',
        version_number: 3,
      });
      plansRepo.setCurrentVersion.mockResolvedValue(mockPlanRecord);

      await service.mergeVersions(mockExecutionContext, ['v1', 'v2'], 'Merge');

      const llmCall = llmService.generateUnifiedResponse.mock.calls[0]![0];
      expect(llmCall.options?.executionContext).toEqual(mockExecutionContext);
    });

    it('should use JSON format when planStructure is provided', async () => {
      versionsRepo.findById.mockImplementation(async (id: string) => {
        if (id === 'v1') return mockVersion1;
        if (id === 'v2') return mockVersion2;
        return null;
      });
      llmService.generateUnifiedResponse.mockResolvedValue('{"merged": true}');
      versionsRepo.getNextVersionNumber.mockResolvedValue(3);
      versionsRepo.markAllAsNotCurrent.mockResolvedValue(undefined);
      versionsRepo.create.mockResolvedValue({
        ...mockVersionRecord,
        id: 'v3',
        version_number: 3,
        format: 'json',
      });
      plansRepo.setCurrentVersion.mockResolvedValue(mockPlanRecord);

      const result = await service.mergeVersions(
        mockExecutionContext,
        ['v1', 'v2'],
        'Merge',
        { planStructure: { type: 'object' } },
      );

      expect(result.newVersion).toBeDefined();
    });
  });

  describe('rerunWithDifferentLLM', () => {
    it('should create new version with different LLM', async () => {
      versionsRepo.findById.mockResolvedValue(mockVersionRecord);
      plansRepo.findById.mockResolvedValue(mockPlanRecord);
      tasksService.getTaskById.mockResolvedValue({
        id: 'task-123',
        prompt: 'Original prompt',
      } as any);
      llmService.generateUnifiedResponse.mockResolvedValue({
        content: '# New Plan',
        metadata: {
          provider: 'openai',
          model: 'gpt-4',
        } as any,
      });
      versionsRepo.getNextVersionNumber.mockResolvedValue(2);
      versionsRepo.markAllAsNotCurrent.mockResolvedValue(undefined);
      versionsRepo.create.mockResolvedValue({
        ...mockVersionRecord,
        id: 'version-2',
        version_number: 2,
        content: '# New Plan',
      });
      plansRepo.setCurrentVersion.mockResolvedValue(mockPlanRecord);

      const result = await service.rerunWithDifferentLLM(
        'version-1',
        { provider: 'openai', model: 'gpt-4' },
        mockExecutionContext,
      );

      expect(result.version.versionNumber).toBe(2);
      expect(llmService.generateUnifiedResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'openai',
          model: 'gpt-4',
          options: expect.objectContaining({
            executionContext: mockExecutionContext,
          }),
        }),
      );
    });

    it('should throw NotFoundException when source version not found', async () => {
      versionsRepo.findById.mockResolvedValue(null);

      await expect(
        service.rerunWithDifferentLLM(
          'non-existent',
          { provider: 'openai', model: 'gpt-4' },
          mockExecutionContext,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when source has no taskId', async () => {
      versionsRepo.findById.mockResolvedValue({
        ...mockVersionRecord,
        task_id: null,
      });
      plansRepo.findById.mockResolvedValue(mockPlanRecord);

      await expect(
        service.rerunWithDifferentLLM(
          'version-1',
          { provider: 'openai', model: 'gpt-4' },
          mockExecutionContext,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when original task has no prompt', async () => {
      versionsRepo.findById.mockResolvedValue(mockVersionRecord);
      plansRepo.findById.mockResolvedValue(mockPlanRecord);
      tasksService.getTaskById.mockResolvedValue({
        id: 'task-123',
        prompt: null,
      } as any);

      await expect(
        service.rerunWithDifferentLLM(
          'version-1',
          { provider: 'openai', model: 'gpt-4' },
          mockExecutionContext,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should pass ExecutionContext to LLM service', async () => {
      versionsRepo.findById.mockResolvedValue(mockVersionRecord);
      plansRepo.findById.mockResolvedValue(mockPlanRecord);
      tasksService.getTaskById.mockResolvedValue({
        id: 'task-123',
        prompt: 'Test prompt',
      } as any);
      llmService.generateUnifiedResponse.mockResolvedValue('# Result');
      versionsRepo.getNextVersionNumber.mockResolvedValue(2);
      versionsRepo.markAllAsNotCurrent.mockResolvedValue(undefined);
      versionsRepo.create.mockResolvedValue({
        ...mockVersionRecord,
        id: 'version-2',
        version_number: 2,
      });
      plansRepo.setCurrentVersion.mockResolvedValue(mockPlanRecord);

      await service.rerunWithDifferentLLM(
        'version-1',
        { provider: 'anthropic', model: 'claude-3-opus' },
        mockExecutionContext,
      );

      const llmCall = llmService.generateUnifiedResponse.mock.calls[0]![0];
      expect(llmCall.options?.executionContext).toEqual(mockExecutionContext);
      expect(llmCall.options?.callerType).toBe('plan_rerun');
    });

    it('should include LLM config in version metadata', async () => {
      versionsRepo.findById.mockResolvedValue(mockVersionRecord);
      plansRepo.findById.mockResolvedValue(mockPlanRecord);
      tasksService.getTaskById.mockResolvedValue({
        id: 'task-123',
        prompt: 'Test prompt',
      } as any);
      llmService.generateUnifiedResponse.mockResolvedValue('# Result');
      versionsRepo.getNextVersionNumber.mockResolvedValue(2);
      versionsRepo.markAllAsNotCurrent.mockResolvedValue(undefined);
      versionsRepo.create.mockResolvedValue({
        ...mockVersionRecord,
        id: 'version-2',
        version_number: 2,
      });
      plansRepo.setCurrentVersion.mockResolvedValue(mockPlanRecord);

      await service.rerunWithDifferentLLM(
        'version-1',
        {
          provider: 'openai',
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 4000,
        },
        mockExecutionContext,
      );

      expect(versionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            sourceVersionId: 'version-1',
            llmRerunInfo: expect.objectContaining({
              provider: 'openai',
              model: 'gpt-4',
              temperature: 0.7,
              maxTokens: 4000,
            }),
          }),
        }),
      );
    });
  });

  describe('ExecutionContext compliance', () => {
    it('should pass full ExecutionContext to LLM service in mergeVersions', async () => {
      const mockVersion1 = {
        ...mockVersionRecord,
        id: 'v1',
        version_number: 1,
      };
      const mockVersion2 = {
        ...mockVersionRecord,
        id: 'v2',
        version_number: 2,
        is_current_version: false,
      };

      plansRepo.findById.mockResolvedValue(mockPlanRecord);
      versionsRepo.findById.mockImplementation(async (id: string) => {
        if (id === 'v1') return mockVersion1;
        if (id === 'v2') return mockVersion2;
        return null;
      });
      llmService.generateUnifiedResponse.mockResolvedValue('# Merged');
      versionsRepo.getNextVersionNumber.mockResolvedValue(3);
      versionsRepo.markAllAsNotCurrent.mockResolvedValue(undefined);
      versionsRepo.create.mockResolvedValue({
        ...mockVersionRecord,
        id: 'v3',
        version_number: 3,
      });
      plansRepo.setCurrentVersion.mockResolvedValue(mockPlanRecord);

      await service.mergeVersions(mockExecutionContext, ['v1', 'v2'], 'Merge');

      // Verify full context is passed, not destructured fields
      const llmCall = llmService.generateUnifiedResponse.mock.calls[0]![0];
      expect(llmCall.options?.executionContext).toBe(mockExecutionContext);
      expect(llmCall.options?.executionContext).toHaveProperty('userId');
      expect(llmCall.options?.executionContext).toHaveProperty('planId');
      expect(llmCall.options?.executionContext).toHaveProperty('agentSlug');
    });

    it('should pass full ExecutionContext to LLM service in rerunWithDifferentLLM', async () => {
      versionsRepo.findById.mockResolvedValue(mockVersionRecord);
      plansRepo.findById.mockResolvedValue(mockPlanRecord);
      tasksService.getTaskById.mockResolvedValue({
        id: 'task-123',
        prompt: 'Test prompt',
      } as any);
      llmService.generateUnifiedResponse.mockResolvedValue('# Result');
      versionsRepo.getNextVersionNumber.mockResolvedValue(2);
      versionsRepo.markAllAsNotCurrent.mockResolvedValue(undefined);
      versionsRepo.create.mockResolvedValue({
        ...mockVersionRecord,
        id: 'version-2',
        version_number: 2,
      });
      plansRepo.setCurrentVersion.mockResolvedValue(mockPlanRecord);

      await service.rerunWithDifferentLLM(
        'version-1',
        { provider: 'anthropic', model: 'claude-3-opus' },
        mockExecutionContext,
      );

      // Verify full context is passed, not destructured fields
      const llmCall = llmService.generateUnifiedResponse.mock.calls[0]![0];
      expect(llmCall.options?.executionContext).toBe(mockExecutionContext);
    });
  });
});
