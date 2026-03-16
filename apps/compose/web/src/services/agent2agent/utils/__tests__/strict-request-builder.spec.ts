/**
 * Unit Tests for Strict Request Builder
 *
 * Tests A2A protocol compliance and JSON-RPC 2.0 request building.
 *
 * Key Testing Areas:
 * - JSON-RPC 2.0 envelope structure
 * - ExecutionContext inclusion in every request
 * - Mode mapping (plan, build, converse)
 * - Payload construction for each action
 * - Validation errors for missing required fields
 * - isStrictRequest type guard
 * - validateStrictRequest helper
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildPlanRequest,
  buildBuildRequest,
  buildConverseRequest,
  buildRequest,
  StrictRequestValidationError,
  isStrictRequest,
  validateStrictRequest,
} from '../strict-request-builder';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
// AgentTaskMode is no longer exported from transport-types; define locally for tests
type AgentTaskMode = string;
const AgentTaskMode = { CONVERSE: 'converse', PLAN: 'plan', BUILD: 'build' } as const;

// ============================================================================
// Test Fixtures
// ============================================================================

const mockUUID = 'test-uuid-1234-5678-9abc-def012345678';

vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => mockUUID),
});

const mockExecutionContext: ExecutionContext = {
  orgSlug: 'test-org',
  userId: 'user-123',
  conversationId: 'conv-456',
  taskId: 'task-789',
  planId: '00000000-0000-0000-0000-000000000000',
  deliverableId: '00000000-0000-0000-0000-000000000000',
  agentSlug: 'test-agent',
  agentType: 'context',
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
};

const baseMetadata = {
  context: mockExecutionContext,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(crypto.randomUUID).mockReturnValue(mockUUID as `${string}-${string}-${string}-${string}-${string}`);
});

// ============================================================================
// StrictRequestValidationError
// ============================================================================

describe('StrictRequestValidationError', () => {
  it('should create error with field and message', () => {
    const error = new StrictRequestValidationError('myField', 'cannot be empty');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(StrictRequestValidationError);
    expect(error.field).toBe('myField');
    expect(error.message).toBe("Validation failed for field 'myField': cannot be empty");
    expect(error.name).toBe('StrictRequestValidationError');
  });
});

// ============================================================================
// buildPlanRequest
// ============================================================================

describe('buildPlanRequest', () => {
  describe('create', () => {
    it('should build a valid JSON-RPC 2.0 plan.create request', () => {
      const request = buildPlanRequest.create(
        { ...baseMetadata, userMessage: 'Create a plan for me' },
      );

      expect(request.jsonrpc).toBe('2.0');
      expect(request.id).toBe(mockUUID);
      expect(request.method).toBe('plan.create');
      expect(request.params.mode).toBe('plan');
      expect(request.params.userMessage).toBe('Create a plan for me');
      expect(request.params.context).toEqual(mockExecutionContext);
      expect(request.params.payload.action).toBe('create');
      expect(request.params.messages).toEqual([]);
    });

    it('should include planData in payload when provided', () => {
      const planData = { title: 'My Plan', objective: 'Do something' };
      const request = buildPlanRequest.create(
        { ...baseMetadata, userMessage: 'Create a plan' },
        planData,
      );

      expect(request.params.payload).toMatchObject({
        action: 'create',
        title: 'My Plan',
        objective: 'Do something',
      });
    });

    it('should throw StrictRequestValidationError when context is missing', () => {
      expect(() =>
        buildPlanRequest.create(
          { context: null as unknown as ExecutionContext, userMessage: 'msg' },
        )
      ).toThrow(StrictRequestValidationError);
    });

    it('should throw StrictRequestValidationError when userMessage is missing', () => {
      expect(() =>
        buildPlanRequest.create(
          { context: mockExecutionContext, userMessage: '' },
        )
      ).toThrow(StrictRequestValidationError);
    });

    it('should include provided messages array', () => {
      const messages = [{ role: 'user' as const, content: 'previous message' }];
      const request = buildPlanRequest.create(
        { ...baseMetadata, userMessage: 'Create', messages },
      );

      expect(request.params.messages).toEqual(messages);
    });
  });

  describe('read', () => {
    it('should build a valid plan.read request without planId', () => {
      const request = buildPlanRequest.read(baseMetadata);

      expect(request.jsonrpc).toBe('2.0');
      expect(request.method).toBe('plan.read');
      expect(request.params.mode).toBe('plan');
      expect(request.params.context).toEqual(mockExecutionContext);
      expect(request.params.payload.action).toBe('read');
      expect(request.params.userMessage).toBe('');
    });

    it('should include planId in payload when provided', () => {
      const request = buildPlanRequest.read(baseMetadata, 'plan-abc-123');

      expect(request.params.payload).toMatchObject({
        action: 'read',
        planId: 'plan-abc-123',
      });
    });

    it('should not include planId key when planId is omitted', () => {
      const request = buildPlanRequest.read(baseMetadata);

      expect(request.params.payload).not.toHaveProperty('planId');
    });
  });

  describe('edit', () => {
    it('should build a valid plan.edit request', () => {
      const request = buildPlanRequest.edit(
        { ...baseMetadata, userMessage: 'Edit the plan' },
        { versionId: 'v-1', content: 'New content' },
      );

      expect(request.method).toBe('plan.edit');
      expect(request.params.payload).toMatchObject({
        action: 'edit',
        versionId: 'v-1',
        content: 'New content',
      });
      expect(request.params.userMessage).toBe('Edit the plan');
    });

    it('should throw when userMessage is missing', () => {
      expect(() =>
        buildPlanRequest.edit(
          { context: mockExecutionContext, userMessage: '' },
          { versionId: 'v-1' },
        )
      ).toThrow(StrictRequestValidationError);
    });
  });

  describe('list', () => {
    it('should build a valid plan.list request', () => {
      const request = buildPlanRequest.list(baseMetadata);

      expect(request.method).toBe('plan.list');
      expect(request.params.payload.action).toBe('list');
      expect(request.params.mode).toBe('plan');
    });
  });

  describe('delete', () => {
    it('should build a valid plan.delete request', () => {
      const request = buildPlanRequest.delete(baseMetadata, 'plan-to-delete');

      expect(request.method).toBe('plan.delete');
      expect(request.params.payload).toMatchObject({
        action: 'delete',
        planId: 'plan-to-delete',
      });
    });

    it('should throw when planId is empty', () => {
      expect(() =>
        buildPlanRequest.delete(baseMetadata, '')
      ).toThrow(StrictRequestValidationError);
    });
  });

  describe('setCurrent', () => {
    it('should build a valid plan.set_current request', () => {
      const request = buildPlanRequest.setCurrent(baseMetadata, 'version-xyz');

      expect(request.method).toBe('plan.set_current');
      expect(request.params.payload).toMatchObject({
        action: 'set_current',
        versionId: 'version-xyz',
      });
    });

    it('should throw when versionId is empty', () => {
      expect(() =>
        buildPlanRequest.setCurrent(baseMetadata, '')
      ).toThrow(StrictRequestValidationError);
    });
  });

  describe('deleteVersion', () => {
    it('should build a valid plan.delete_version request', () => {
      const request = buildPlanRequest.deleteVersion(baseMetadata, 'v-42');

      expect(request.method).toBe('plan.delete_version');
      expect(request.params.payload).toMatchObject({
        action: 'delete_version',
        versionId: 'v-42',
      });
    });
  });

  describe('mergeVersions', () => {
    it('should build a valid plan.merge_versions request', () => {
      const request = buildPlanRequest.mergeVersions(
        { ...baseMetadata, userMessage: 'Merge these' },
        { versionIds: ['v-1', 'v-2'], mergePrompt: 'Please merge' },
      );

      expect(request.method).toBe('plan.merge_versions');
      expect(request.params.payload).toMatchObject({
        action: 'merge_versions',
        versionIds: ['v-1', 'v-2'],
        mergePrompt: 'Please merge',
      });
    });

    it('should throw when versionIds is missing', () => {
      expect(() =>
        buildPlanRequest.mergeVersions(
          { ...baseMetadata, userMessage: 'Merge' },
          { versionIds: null as unknown as string[], mergePrompt: 'prompt' },
        )
      ).toThrow(StrictRequestValidationError);
    });

    it('should throw when mergePrompt is missing', () => {
      expect(() =>
        buildPlanRequest.mergeVersions(
          { ...baseMetadata, userMessage: 'Merge' },
          { versionIds: ['v-1'], mergePrompt: '' },
        )
      ).toThrow(StrictRequestValidationError);
    });
  });

  describe('copyVersion', () => {
    it('should build a valid plan.copy_version request', () => {
      const request = buildPlanRequest.copyVersion(baseMetadata, 'v-source');

      expect(request.method).toBe('plan.copy_version');
      expect(request.params.payload).toMatchObject({
        action: 'copy_version',
        versionId: 'v-source',
      });
    });
  });
});

// ============================================================================
// buildBuildRequest
// ============================================================================

describe('buildBuildRequest', () => {
  describe('execute', () => {
    it('should build a valid build.execute request', () => {
      const request = buildBuildRequest.execute(
        { ...baseMetadata, userMessage: 'Build this deliverable' },
      );

      expect(request.jsonrpc).toBe('2.0');
      expect(request.method).toBe('build.execute');
      expect(request.params.mode).toBe('build');
      expect(request.params.context).toEqual(mockExecutionContext);
      expect(request.params.payload.action).toBe('create');
      expect(request.params.userMessage).toBe('Build this deliverable');
    });

    it('should include buildData in payload when provided', () => {
      const request = buildBuildRequest.execute(
        { ...baseMetadata, userMessage: 'Build' },
        { planId: 'plan-abc', customProp: 'value' },
      );

      expect(request.params.payload).toMatchObject({
        action: 'create',
        planId: 'plan-abc',
        customProp: 'value',
      });
      expect(request.params.planId).toBe('plan-abc');
    });

    it('should throw when context is missing', () => {
      expect(() =>
        buildBuildRequest.execute(
          { context: null as unknown as ExecutionContext, userMessage: 'Build' },
        )
      ).toThrow(StrictRequestValidationError);
    });
  });

  describe('read', () => {
    it('should build a valid build.read request', () => {
      const request = buildBuildRequest.read(baseMetadata);

      expect(request.method).toBe('build.read');
      expect(request.params.payload.action).toBe('read');
    });

    it('should include deliverableId in payload when provided', () => {
      const request = buildBuildRequest.read(baseMetadata, 'del-789');

      expect(request.params.payload).toMatchObject({
        action: 'read',
        deliverableId: 'del-789',
      });
    });

    it('should not include deliverableId key when omitted', () => {
      const request = buildBuildRequest.read(baseMetadata);

      expect(request.params.payload).not.toHaveProperty('deliverableId');
    });
  });

  describe('list', () => {
    it('should build a valid build.list request', () => {
      const request = buildBuildRequest.list(baseMetadata);

      expect(request.method).toBe('build.list');
      expect(request.params.payload.action).toBe('list');
    });
  });

  describe('rerun', () => {
    it('should build a valid build.rerun request', () => {
      const request = buildBuildRequest.rerun(
        { ...baseMetadata, userMessage: 'Rerun this' },
        { versionId: 'v-old', config: { temperature: 0.7 } },
      );

      expect(request.method).toBe('build.rerun');
      expect(request.params.payload).toMatchObject({
        action: 'rerun',
        versionId: 'v-old',
        config: { temperature: 0.7 },
      });
    });

    it('should throw when versionId is missing', () => {
      expect(() =>
        buildBuildRequest.rerun(
          { ...baseMetadata, userMessage: 'Rerun' },
          { versionId: '', config: {} },
        )
      ).toThrow(StrictRequestValidationError);
    });
  });

  describe('edit', () => {
    it('should build a valid build.edit request', () => {
      const request = buildBuildRequest.edit(
        { ...baseMetadata, userMessage: 'Fix this section' },
        { versionId: 'v-2', content: 'Updated content' },
      );

      expect(request.method).toBe('build.edit');
      expect(request.params.payload).toMatchObject({
        action: 'edit',
        versionId: 'v-2',
        content: 'Updated content',
      });
    });
  });

  describe('setCurrent', () => {
    it('should build a valid build.set_current request', () => {
      const request = buildBuildRequest.setCurrent(baseMetadata, 'v-current');

      expect(request.method).toBe('build.set_current');
      expect(request.params.payload).toMatchObject({
        action: 'set_current',
        versionId: 'v-current',
      });
    });
  });

  describe('deleteVersion', () => {
    it('should build a valid build.delete_version request', () => {
      const request = buildBuildRequest.deleteVersion(baseMetadata, 'v-99');

      expect(request.method).toBe('build.delete_version');
      expect(request.params.payload).toMatchObject({
        action: 'delete_version',
        versionId: 'v-99',
      });
    });
  });

  describe('mergeVersions', () => {
    it('should build a valid build.merge_versions request', () => {
      const request = buildBuildRequest.mergeVersions(
        { ...baseMetadata, userMessage: 'Merge deliverables' },
        { versionIds: ['d-1', 'd-2'], mergePrompt: 'Combine them' },
      );

      expect(request.method).toBe('build.merge_versions');
      expect(request.params.payload).toMatchObject({
        action: 'merge_versions',
        versionIds: ['d-1', 'd-2'],
        mergePrompt: 'Combine them',
      });
    });
  });

  describe('copyVersion', () => {
    it('should build a valid build.copy_version request', () => {
      const request = buildBuildRequest.copyVersion(baseMetadata, 'd-source');

      expect(request.method).toBe('build.copy_version');
      expect(request.params.payload).toMatchObject({
        action: 'copy_version',
        versionId: 'd-source',
      });
    });
  });

  describe('delete', () => {
    it('should build a valid build.delete request', () => {
      const request = buildBuildRequest.delete(baseMetadata, 'del-to-remove');

      expect(request.method).toBe('build.delete');
      expect(request.params.payload).toMatchObject({
        action: 'delete',
        deliverableId: 'del-to-remove',
      });
    });

    it('should throw when deliverableId is empty', () => {
      expect(() =>
        buildBuildRequest.delete(baseMetadata, '')
      ).toThrow(StrictRequestValidationError);
    });
  });
});

// ============================================================================
// buildConverseRequest
// ============================================================================

describe('buildConverseRequest', () => {
  describe('send', () => {
    it('should build a valid converse request', () => {
      const request = buildConverseRequest.send(
        { ...baseMetadata, userMessage: 'Hello, agent!' },
      );

      expect(request.jsonrpc).toBe('2.0');
      expect(request.id).toBe(mockUUID);
      expect(request.method).toBe('converse');
      expect(request.params.mode).toBe('converse');
      expect(request.params.context).toEqual(mockExecutionContext);
      expect(request.params.userMessage).toBe('Hello, agent!');
      expect(request.params.payload).toMatchObject({ action: 'send' });
      expect(request.params.messages).toEqual([]);
    });

    it('should throw when context is missing', () => {
      expect(() =>
        buildConverseRequest.send(
          { context: null as unknown as ExecutionContext, userMessage: 'Hello' },
        )
      ).toThrow(StrictRequestValidationError);
    });

    it('should throw when userMessage is empty', () => {
      expect(() =>
        buildConverseRequest.send({ ...baseMetadata, userMessage: '' })
      ).toThrow(StrictRequestValidationError);
    });
  });
});

// ============================================================================
// buildRequest (unified entry point)
// ============================================================================

describe('buildRequest', () => {
  it('should expose plan, build, and converse builders', () => {
    expect(buildRequest.plan).toBe(buildPlanRequest);
    expect(buildRequest.build).toBe(buildBuildRequest);
    expect(buildRequest.converse).toBe(buildConverseRequest);
  });
});

// ============================================================================
// isStrictRequest type guard
// ============================================================================

describe('isStrictRequest', () => {
  it('should return true for a valid strict request', () => {
    const request = buildConverseRequest.send(
      { ...baseMetadata, userMessage: 'test' },
    );

    expect(isStrictRequest(request)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isStrictRequest(null)).toBe(false);
  });

  it('should return false for a plain string', () => {
    expect(isStrictRequest('not a request')).toBe(false);
  });

  it('should return false when jsonrpc is wrong version', () => {
    const invalid = { jsonrpc: '1.0', id: '1', method: 'test', params: {} };
    expect(isStrictRequest(invalid)).toBe(false);
  });

  it('should return false when method is missing', () => {
    const invalid = { jsonrpc: '2.0', id: '1', params: {} };
    expect(isStrictRequest(invalid)).toBe(false);
  });

  it('should return false when params is missing', () => {
    const invalid = { jsonrpc: '2.0', id: '1', method: 'test' };
    expect(isStrictRequest(invalid)).toBe(false);
  });

  it('should return false when id is missing', () => {
    const invalid = { jsonrpc: '2.0', method: 'test', params: {} };
    expect(isStrictRequest(invalid)).toBe(false);
  });
});

// ============================================================================
// validateStrictRequest
// ============================================================================

describe('validateStrictRequest', () => {
  it('should return valid:true for a well-formed request', () => {
    const request = buildPlanRequest.create(
      { ...baseMetadata, userMessage: 'Create a plan' },
    );

    const result = validateStrictRequest(request);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should collect errors for a malformed request with wrong jsonrpc', () => {
    const badRequest = {
      jsonrpc: '1.0' as '2.0',
      id: 'some-id',
      method: 'plan.create',
      params: {
        mode: AgentTaskMode.PLAN,
        context: mockExecutionContext,
        userMessage: 'hi',
        messages: [],
        payload: { action: 'create' as const },
      },
    };

    const result = validateStrictRequest(badRequest);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid jsonrpc version');
  });

  it('should report missing context in params', () => {
    const badRequest = {
      jsonrpc: '2.0' as const,
      id: 'some-id',
      method: 'plan.create',
      params: {
        mode: AgentTaskMode.PLAN,
        context: null as unknown as ExecutionContext,
        userMessage: 'hi',
        messages: [],
        payload: { action: 'create' as const },
      },
    };

    const result = validateStrictRequest(badRequest);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing context in params');
  });

  it('should report missing mode in params', () => {
    const badRequest = {
      jsonrpc: '2.0' as const,
      id: 'some-id',
      method: 'plan.create',
      params: {
        mode: null as unknown as AgentTaskMode,
        context: mockExecutionContext,
        userMessage: 'hi',
        messages: [],
        payload: { action: 'create' as const },
      },
    };

    const result = validateStrictRequest(badRequest);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing mode in params');
  });

  it('should accumulate multiple errors', () => {
    const badRequest = {
      jsonrpc: '1.0' as '2.0',
      id: '',
      method: '',
      params: null as unknown as { mode: AgentTaskMode; context: ExecutionContext; userMessage: string; messages: []; payload: { action: 'create' } },
    };

    const result = validateStrictRequest(badRequest);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================================
// ExecutionContext flow validation (execution-context-skill compliance)
// ============================================================================

describe('ExecutionContext flow validation', () => {
  it('every request must carry the full ExecutionContext', () => {
    const requests = [
      buildPlanRequest.create({ ...baseMetadata, userMessage: 'create' }),
      buildPlanRequest.read(baseMetadata),
      buildBuildRequest.execute({ ...baseMetadata, userMessage: 'build' }),
      buildConverseRequest.send({ ...baseMetadata, userMessage: 'converse' }),
    ];

    for (const request of requests) {
      const ctx = request.params.context;
      expect(ctx).toMatchObject({
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-456',
        taskId: 'task-789',
        agentSlug: 'test-agent',
        agentType: 'context',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
      });
    }
  });

  it('ExecutionContext is passed by reference, never mutated by builders', () => {
    const originalContext = { ...mockExecutionContext };

    buildPlanRequest.create({ ...baseMetadata, userMessage: 'test' });

    // The original context object must not be mutated
    expect(mockExecutionContext).toEqual(originalContext);
  });
});
