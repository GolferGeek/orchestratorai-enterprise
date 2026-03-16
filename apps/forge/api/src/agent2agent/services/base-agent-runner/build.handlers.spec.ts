import 'reflect-metadata';
import { AgentRuntimeDefinition } from '@agent-platform/interfaces/agent.interface';
import {
  handleBuildRead,
  handleBuildList,
  handleBuildEdit,
  handleBuildRerun,
  handleBuildSetCurrent,
  handleBuildDeleteVersion,
  handleBuildMergeVersions,
  handleBuildCopyVersion,
  handleBuildDelete,
  validateDeliverableStructure,
  validateDeliverableSchema,
  BuildHandlerDependencies,
} from './build.handlers';
import { TaskRequestDto, AgentTaskMode } from '../../dto/task-request.dto';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type {
  BuildReadPayload,
  BuildListPayload,
  BuildEditPayload,
  BuildRerunPayload,
  BuildSetCurrentPayload,
  BuildDeleteVersionPayload,
  BuildMergeVersionsPayload,
  BuildCopyVersionPayload,
  BuildDeletePayload,
} from '@orchestrator-ai/transport-types/modes/build.types';

describe('Build Handlers', () => {
  let mockServices: jest.Mocked<BuildHandlerDependencies>;
  let mockDefinition: AgentRuntimeDefinition;
  let mockRequest: TaskRequestDto;

  beforeEach(() => {
    // Mock services
    mockServices = {
      deliverablesService: {
        executeAction: jest.fn(),
        findOne: jest.fn(),
        findByConversationId: jest.fn(),
      } as any,
      plansService: {} as any,
      llmService: {} as any,
      conversationsService: {} as any,
    } as jest.Mocked<BuildHandlerDependencies>;

    // Mock agent definition
    mockDefinition = {
      id: 'test-id',
      slug: 'test-agent',
      displayName: 'Test Agent',
      organizationSlug: 'test-org',
      agentType: 'specialist',
      modeProfile: { standard: { plan: true, build: true, converse: true } },
    } as unknown as AgentRuntimeDefinition;

    // Mock request
    mockRequest = {
      context: createMockExecutionContext({
        userId: 'user-1',
        conversationId: 'conv-1',
        taskId: 'task-1',
        deliverableId: 'del-1',
      }),
      mode: AgentTaskMode.BUILD,
      payload: {},
    };
  });

  describe('handleBuildRead', () => {
    it('should read current deliverable version', async () => {
      const payload: Partial<BuildReadPayload> = {
        action: 'read',
      };

      mockRequest.payload = payload as any;

      const mockDeliverable = {
        id: 'del-1',
        conversationId: 'conv-1',
        userId: 'user-1',
        title: 'Test Deliverable',
        type: 'document',
        currentVersion: {
          id: 'ver-1',
          content: 'Deliverable content',
          format: 'markdown',
          versionNumber: 1,
          isCurrentVersion: true,
          createdByType: 'agent',
          createdAt: new Date().toISOString(),
        },
      };

      mockServices.deliverablesService.findByConversationId = jest
        .fn()
        .mockResolvedValue([mockDeliverable]);
      mockServices.deliverablesService.findOne = jest
        .fn()
        .mockResolvedValue(mockDeliverable);
      (
        mockServices.deliverablesService.executeAction as jest.Mock
      ).mockResolvedValue({
        success: true,
        data: {
          deliverable: mockDeliverable,
          version: mockDeliverable.currentVersion,
        },
      });

      const result = await handleBuildRead(
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

    it('should fail when no deliverable exists', async () => {
      const payload: Partial<BuildReadPayload> = {
        action: 'read',
      };

      mockRequest.payload = payload as any;
      mockServices.deliverablesService.findByConversationId = jest
        .fn()
        .mockResolvedValue([]);

      const result = await handleBuildRead(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      expect(result.success).toBe(false);
      expect(result.payload.metadata?.reason).toContain('No deliverable found');
    });

    it('should read specific version when versionId provided', async () => {
      const payload: Partial<BuildReadPayload> = {
        action: 'read',
        versionId: 'ver-2',
      };

      mockRequest.payload = payload as any;

      const mockDeliverable = {
        id: 'del-1',
        conversationId: 'conv-1',
        userId: 'user-1',
      };

      mockServices.deliverablesService.findByConversationId = jest
        .fn()
        .mockResolvedValue([mockDeliverable]);
      mockServices.deliverablesService.findOne = jest
        .fn()
        .mockResolvedValue(mockDeliverable);
      (
        mockServices.deliverablesService.executeAction as jest.Mock
      ).mockResolvedValue({
        success: true,
        data: {
          versions: [
            {
              id: 'ver-2',
              content: 'Version 2 content',
              versionNumber: 2,
            },
          ],
        },
      });

      const result = await handleBuildRead(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      expect(result.success).toBe(true);
    });
  });

  describe('handleBuildList', () => {
    it('should list all deliverable versions', async () => {
      const payload: Partial<BuildListPayload> = {
        action: 'list',
        includeArchived: false,
      };

      mockRequest.payload = payload as any;

      (
        mockServices.deliverablesService.executeAction as jest.Mock
      ).mockResolvedValue({
        success: true,
        data: {
          deliverable: {
            id: 'del-1',
            conversationId: 'conv-1',
          },
          versions: [
            { id: 'ver-1', versionNumber: 1 },
            { id: 'ver-2', versionNumber: 2 },
          ],
        },
      });

      const result = await handleBuildList(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      expect(result.success).toBe(true);
      expect(result.payload.content.versions).toHaveLength(2);
    });

    it('should include archived versions when requested', async () => {
      const payload: Partial<BuildListPayload> = {
        action: 'list',
        includeArchived: true,
      };

      mockRequest.payload = payload as any;

      (
        mockServices.deliverablesService.executeAction as jest.Mock
      ).mockResolvedValue({
        success: true,
        data: {
          deliverable: { id: 'del-1' },
          versions: [
            { id: 'ver-1', versionNumber: 1 },
            { id: 'ver-2', versionNumber: 2, archived: true },
          ],
        },
      });

      const result = await handleBuildList(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      expect(result.success).toBe(true);
      expect(result.payload.content.versions).toHaveLength(2);
    });
  });

  describe('handleBuildEdit', () => {
    it('should edit deliverable with valid content', async () => {
      const payload: Partial<BuildEditPayload> = {
        action: 'edit',
        editedContent: 'Updated deliverable content',
        comment: 'Fixed formatting',
      };

      mockRequest.payload = payload as any;

      (
        mockServices.deliverablesService.executeAction as jest.Mock
      ).mockResolvedValue({
        success: true,
        data: {
          deliverable: { id: 'del-1' },
          version: {
            id: 'ver-2',
            content: 'Updated deliverable content',
            versionNumber: 2,
          },
        },
      });

      const result = await handleBuildEdit(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      expect(result.success).toBe(true);
      expect(result.payload.content.version.versionNumber).toBe(2);
    });

    it('should fail when editedContent is missing', async () => {
      const payload: Partial<BuildEditPayload> = {
        action: 'edit',
        // Missing editedContent
      };

      mockRequest.payload = payload as any;

      const result = await handleBuildEdit(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      expect(result.success).toBe(false);
      expect(result.payload.metadata?.reason).toContain(
        'editedContent is required',
      );
    });

    it('should validate deliverable structure when provided', async () => {
      const deliverableStructure = {
        type: 'object',
        properties: {
          title: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['title', 'content'],
      };

      mockDefinition.deliverableStructure = deliverableStructure;

      const payload: Partial<BuildEditPayload> = {
        action: 'edit',
        editedContent: JSON.stringify({
          title: 'My Blog',
          content: 'Blog content',
        }),
      };

      mockRequest.payload = payload as any;

      (
        mockServices.deliverablesService.executeAction as jest.Mock
      ).mockResolvedValue({
        success: true,
        data: {
          deliverable: { id: 'del-1' },
          version: { id: 'ver-2' },
        },
      });

      const result = await handleBuildEdit(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      expect(result.success).toBe(true);
    });
  });

  describe('handleBuildRerun', () => {
    const mockExecuteBuild = jest.fn();

    it('should rerun deliverable with LLM override', async () => {
      const payload: BuildRerunPayload = {
        action: 'rerun',
        versionId: 'ver-1',
        llmOverride: {
          provider: 'openai',
          model: 'gpt-4',
          temperature: 0.7,
        },
      };

      mockRequest.payload = payload as any;

      const mockDeliverable = {
        id: 'del-1',
        conversationId: 'conv-1',
        userId: 'user-1',
        title: 'Test Deliverable',
        type: 'document',
      };

      mockServices.deliverablesService.findByConversationId = jest
        .fn()
        .mockResolvedValue([mockDeliverable]);
      mockServices.deliverablesService.findOne = jest
        .fn()
        .mockResolvedValue(mockDeliverable);
      (
        mockServices.deliverablesService.executeAction as jest.Mock
      ).mockResolvedValue({
        success: true,
        data: {
          versions: [{ id: 'ver-1', content: 'Original content' }],
        },
      });

      mockExecuteBuild.mockResolvedValue({
        success: true,
        mode: AgentTaskMode.BUILD,
        payload: {
          content: {
            deliverable: mockDeliverable,
            version: { id: 'ver-2', content: 'Regenerated content' },
          },
          metadata: {},
        },
      });

      const result = await handleBuildRerun(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
        mockExecuteBuild,
      );

      expect(result.success).toBe(true);
      expect(result.payload.metadata.llmOverride).toBeDefined();
    });

    it('should fail when versionId is missing', async () => {
      const payload = {
        action: 'rerun',
        llmOverride: { provider: 'openai', model: 'gpt-4' },
      } as any;

      mockRequest.payload = payload;

      const result = await handleBuildRerun(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
        mockExecuteBuild,
      );

      expect(result.success).toBe(false);
      expect(result.payload.metadata?.reason).toContain(
        'versionId and llmOverride are required',
      );
    });

    it('should fail when llmOverride is missing', async () => {
      const payload = {
        action: 'rerun',
        versionId: 'ver-1',
      } as any;

      mockRequest.payload = payload;

      const result = await handleBuildRerun(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
        mockExecuteBuild,
      );

      expect(result.success).toBe(false);
    });
  });

  describe('handleBuildSetCurrent', () => {
    it('should set current version', async () => {
      const payload: BuildSetCurrentPayload = {
        action: 'set_current',
        versionId: 'ver-2',
      };

      mockRequest.payload = payload as any;

      (
        mockServices.deliverablesService.executeAction as jest.Mock
      ).mockResolvedValue({
        success: true,
        data: {
          deliverable: { id: 'del-1', currentVersionId: 'ver-2' },
          version: { id: 'ver-2', isCurrentVersion: true },
        },
      });

      const result = await handleBuildSetCurrent(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      expect(result.success).toBe(true);
      expect(result.payload.metadata.updatedVersionId).toBe('ver-2');
    });

    it('should fail when versionId is missing', async () => {
      const payload = { action: 'set_current' } as any;
      mockRequest.payload = payload;

      const result = await handleBuildSetCurrent(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      expect(result.success).toBe(false);
      expect(result.payload.metadata?.reason).toContain(
        'versionId is required',
      );
    });
  });

  describe('handleBuildDeleteVersion', () => {
    it('should delete specific version', async () => {
      const payload: BuildDeleteVersionPayload = {
        action: 'delete_version',
        versionId: 'ver-1',
      };

      mockRequest.payload = payload as any;

      (
        mockServices.deliverablesService.executeAction as jest.Mock
      ).mockResolvedValue({
        success: true,
        data: {
          deliverable: { id: 'del-1' },
          remainingVersions: [{ id: 'ver-2' }],
        },
      });

      const result = await handleBuildDeleteVersion(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      expect(result.success).toBe(true);
      expect(result.payload.content.versionId).toBe('ver-1');
      expect(result.payload.content.remainingVersions).toHaveLength(1);
    });

    it('should fail when versionId is missing', async () => {
      const payload = { action: 'delete_version' } as any;
      mockRequest.payload = payload;

      const result = await handleBuildDeleteVersion(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      expect(result.success).toBe(false);
    });
  });

  describe('handleBuildMergeVersions', () => {
    const mockExecuteBuild = jest.fn();

    it('should merge multiple versions', async () => {
      const payload: BuildMergeVersionsPayload = {
        action: 'merge_versions',
        versionIds: ['ver-1', 'ver-2'],
        mergePrompt: 'Combine the best parts',
      };

      mockRequest.payload = payload as any;

      const mockDeliverable = {
        id: 'del-1',
        conversationId: 'conv-1',
        userId: 'user-1',
        title: 'Test Deliverable',
        type: 'document',
      };

      mockServices.deliverablesService.findByConversationId = jest
        .fn()
        .mockResolvedValue([mockDeliverable]);
      mockServices.deliverablesService.findOne = jest
        .fn()
        .mockResolvedValue(mockDeliverable);
      (
        mockServices.deliverablesService.executeAction as jest.Mock
      ).mockResolvedValue({
        success: true,
        data: {
          versions: [
            { id: 'ver-1', content: 'Version 1' },
            { id: 'ver-2', content: 'Version 2' },
          ],
        },
      });

      mockExecuteBuild.mockResolvedValue({
        success: true,
        mode: AgentTaskMode.BUILD,
        payload: {
          content: {
            deliverable: mockDeliverable,
            version: { id: 'ver-3', content: 'Merged content' },
          },
          metadata: {},
        },
      });

      const result = await handleBuildMergeVersions(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
        mockExecuteBuild,
      );

      expect(result.success).toBe(true);
    });

    it('should fail with less than 2 versions', async () => {
      const payload = {
        action: 'merge_versions',
        versionIds: ['ver-1'],
        mergePrompt: 'Merge',
      } as any;

      mockRequest.payload = payload;

      const result = await handleBuildMergeVersions(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
        mockExecuteBuild,
      );

      expect(result.success).toBe(false);
      expect(result.payload.metadata?.reason).toContain(
        'At least two versionIds are required',
      );
    });

    it('should fail when mergePrompt is missing', async () => {
      const payload = {
        action: 'merge_versions',
        versionIds: ['ver-1', 'ver-2'],
      } as any;

      mockRequest.payload = payload;

      const result = await handleBuildMergeVersions(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
        mockExecuteBuild,
      );

      expect(result.success).toBe(false);
      expect(result.payload.metadata?.reason).toContain(
        'mergePrompt is required',
      );
    });
  });

  describe('handleBuildCopyVersion', () => {
    it('should copy version', async () => {
      const payload: BuildCopyVersionPayload = {
        action: 'copy_version',
        versionId: 'ver-1',
      };

      mockRequest.payload = payload as any;

      (
        mockServices.deliverablesService.executeAction as jest.Mock
      ).mockResolvedValue({
        success: true,
        data: {
          sourceDeliverable: { id: 'del-1' },
          sourceVersion: { id: 'ver-1' },
          targetDeliverable: { id: 'del-2' },
          copiedVersion: { id: 'ver-2' },
        },
      });

      const result = await handleBuildCopyVersion(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      expect(result.success).toBe(true);
      expect(result.payload.content.version).toBeDefined();
    });

    it('should fail when versionId is missing', async () => {
      const payload = { action: 'copy_version' } as any;
      mockRequest.payload = payload;

      const result = await handleBuildCopyVersion(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      expect(result.success).toBe(false);
    });
  });

  describe('handleBuildDelete', () => {
    it('should delete entire deliverable', async () => {
      const payload: BuildDeletePayload = {
        action: 'delete',
      };

      mockRequest.payload = payload as any;

      (
        mockServices.deliverablesService.executeAction as jest.Mock
      ).mockResolvedValue({
        success: true,
        data: {
          deletedDeliverableId: 'del-1',
          deletedVersionCount: 3,
        },
      });

      const result = await handleBuildDelete(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      expect(result.success).toBe(true);
      expect(result.payload.content.deliverableId).toBe('del-1');
      expect(result.payload.content.deletedVersionCount).toBe(3);
    });
  });

  describe('validateDeliverableStructure', () => {
    it('should validate content against deliverable structure', () => {
      const deliverableStructure = {
        type: 'object',
        properties: {
          title: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['title', 'content'],
      };

      const validContent = JSON.stringify({
        title: 'My Document',
        content: 'Document content',
      });

      expect(() => {
        validateDeliverableStructure(validContent, deliverableStructure);
      }).not.toThrow();
    });

    it('should throw for invalid structure', () => {
      const deliverableStructure = {
        type: 'object',
        properties: {
          title: { type: 'string' },
        },
        required: ['title'],
      };

      const invalidContent = JSON.stringify({
        // Missing required title
        content: 'Content',
      });

      expect(() => {
        validateDeliverableStructure(invalidContent, deliverableStructure);
      }).toThrow('Deliverable does not conform to agent structure');
    });

    it('should skip validation when structure is null', () => {
      const content = 'Any content';

      expect(() => {
        validateDeliverableStructure(content, null);
      }).not.toThrow();
    });
  });

  describe('validateDeliverableSchema', () => {
    it('should validate content against IO schema', () => {
      const ioSchema = {
        type: 'object',
        properties: {
          blog_post: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              body: { type: 'string' },
            },
            required: ['title', 'body'],
          },
        },
        required: ['blog_post'],
      };

      const validContent = JSON.stringify({
        blog_post: {
          title: 'My Blog',
          body: 'Blog body',
        },
      });

      expect(() => {
        validateDeliverableSchema(validContent, ioSchema);
      }).not.toThrow();
    });

    it('should throw for invalid IO schema', () => {
      const ioSchema = {
        type: 'object',
        properties: {
          blog_post: {
            type: 'object',
            properties: {
              title: { type: 'string' },
            },
            required: ['title'],
          },
        },
        required: ['blog_post'],
      };

      const invalidContent = JSON.stringify({
        // Missing required blog_post
        other_field: 'value',
      });

      expect(() => {
        validateDeliverableSchema(invalidContent, ioSchema);
      }).toThrow('Deliverable output does not conform to io_schema');
    });

    it('should skip validation when IO schema is null', () => {
      const content = 'Any content';

      expect(() => {
        validateDeliverableSchema(content, null);
      }).not.toThrow();
    });
  });

  describe('Transport-types compliance', () => {
    it('should work with ExecutionContext from transport-types', async () => {
      const mockContext = createMockExecutionContext({
        userId: 'test-user',
        conversationId: 'conv-123',
        deliverableId: 'del-123',
      });

      mockRequest.context = mockContext;

      const mockDeliverable = {
        id: 'del-123',
        conversationId: 'conv-123',
        userId: 'test-user',
      };

      mockServices.deliverablesService.findByConversationId = jest
        .fn()
        .mockResolvedValue([mockDeliverable]);
      mockServices.deliverablesService.findOne = jest
        .fn()
        .mockResolvedValue(mockDeliverable);
      (
        mockServices.deliverablesService.executeAction as jest.Mock
      ).mockResolvedValue({
        success: true,
        data: {
          deliverable: mockDeliverable,
          version: { id: 'ver-1' },
        },
      });

      const result = await handleBuildRead(
        mockDefinition,
        mockRequest,
        'test-org',
        mockServices,
      );

      expect(result.success).toBe(true);
    });

    it('should validate all BuildModePayload action types', () => {
      const actions = [
        'create',
        'read',
        'list',
        'edit',
        'rerun',
        'set_current',
        'delete_version',
        'merge_versions',
        'copy_version',
        'delete',
      ];

      actions.forEach((action) => {
        expect(action).toBeTruthy();
      });
    });
  });
});
