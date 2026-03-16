/**
 * Unit tests for CAD Agent State (cad-agent.state.ts)
 *
 * Tests the state annotation definitions, interfaces, and default values.
 * Coverage targets: CadAgentStateAnnotation, all interfaces
 */
import {
  CadAgentStateAnnotation,
  CadConstraints,
  CadOutputs,
  MeshStats,
  CadAgentInput,
  CadAgentResult,
  CadAgentStatus,
} from './cad-agent.state';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

describe('CadAgentState', () => {
  const mockContext = createMockExecutionContext({
    conversationId: 'conv-123',
    userId: 'user-456',
    orgSlug: 'test-org',
    conversationId: 'conv-123',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
  });

  describe('CadAgentStateAnnotation', () => {
    it('should be defined', () => {
      expect(CadAgentStateAnnotation).toBeDefined();
    });

    it('should have a spec object', () => {
      expect(CadAgentStateAnnotation.spec).toBeDefined();
    });

    it('should have all expected fields in spec', () => {
      const spec = CadAgentStateAnnotation.spec;
      expect(spec.executionContext).toBeDefined();
      expect(spec.userMessage).toBeDefined();
      expect(spec.projectId).toBeDefined();
      expect(spec.drawingId).toBeDefined();
      expect(spec.constraints).toBeDefined();
      expect(spec.generatedCode).toBeDefined();
      expect(spec.codeType).toBeDefined();
      expect(spec.isCodeValid).toBeDefined();
      expect(spec.validationErrors).toBeDefined();
      expect(spec.codeAttempt).toBeDefined();
      expect(spec.executionStatus).toBeDefined();
      expect(spec.executionError).toBeDefined();
      expect(spec.executionTimeMs).toBeDefined();
      expect(spec.outputs).toBeDefined();
      expect(spec.meshStats).toBeDefined();
      expect(spec.status).toBeDefined();
      expect(spec.error).toBeDefined();
      expect(spec.startedAt).toBeDefined();
      expect(spec.completedAt).toBeDefined();
    });

    it('should have messages from MessagesAnnotation', () => {
      const spec = CadAgentStateAnnotation.spec;
      expect(spec.messages).toBeDefined();
    });
  });

  describe('CadConstraints interface', () => {
    it('should allow all optional fields', () => {
      const constraints: CadConstraints = {
        units: 'mm',
        material: 'steel',
        manufacturing_method: 'cnc',
        tolerance_class: 'A',
        wall_thickness_min: 2.5,
        customField: 'customValue',
      };
      expect(constraints.units).toBe('mm');
      expect(constraints.material).toBe('steel');
      expect(constraints.manufacturing_method).toBe('cnc');
      expect(constraints.tolerance_class).toBe('A');
      expect(constraints.wall_thickness_min).toBe(2.5);
      expect(constraints.customField).toBe('customValue');
    });

    it('should allow empty constraints', () => {
      const constraints: CadConstraints = {};
      expect(Object.keys(constraints)).toHaveLength(0);
    });

    it('should allow partial constraints', () => {
      const constraints: CadConstraints = { units: 'in' };
      expect(constraints.units).toBe('in');
      expect(constraints.material).toBeUndefined();
    });

    it('should allow unknown additional fields via index signature', () => {
      const constraints: CadConstraints = {
        customProperty: 42,
        anotherProp: { nested: true },
      };
      expect(constraints.customProperty).toBe(42);
    });
  });

  describe('MeshStats interface', () => {
    it('should have vertices and faces as required fields', () => {
      const stats: MeshStats = {
        vertices: 100,
        faces: 50,
      };
      expect(stats.vertices).toBe(100);
      expect(stats.faces).toBe(50);
    });

    it('should allow optional boundingBox', () => {
      const stats: MeshStats = { vertices: 8, faces: 6 };
      expect(stats.boundingBox).toBeUndefined();
    });

    it('should support full bounding box', () => {
      const stats: MeshStats = {
        vertices: 100,
        faces: 50,
        boundingBox: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
      };
      expect(stats.boundingBox?.min.x).toBe(-5);
      expect(stats.boundingBox?.max.z).toBe(5);
    });
  });

  describe('CadOutputs interface', () => {
    it('should allow all optional output formats', () => {
      const outputs: CadOutputs = {
        step: 'https://example.com/model.step',
        stl: 'https://example.com/model.stl',
        gltf: 'https://example.com/model.gltf',
        dxf: 'https://example.com/model.dxf',
        thumbnail: 'https://example.com/thumbnail.png',
      };
      expect(outputs.step).toBeDefined();
      expect(outputs.stl).toBeDefined();
      expect(outputs.gltf).toBeDefined();
      expect(outputs.dxf).toBeDefined();
      expect(outputs.thumbnail).toBeDefined();
    });

    it('should allow empty outputs', () => {
      const outputs: CadOutputs = {};
      expect(Object.keys(outputs)).toHaveLength(0);
    });

    it('should allow partial outputs', () => {
      const outputs: CadOutputs = { step: 'https://example.com/model.step' };
      expect(outputs.step).toBeDefined();
      expect(outputs.stl).toBeUndefined();
    });
  });

  describe('CadAgentInput interface', () => {
    it('should accept all required and optional fields', () => {
      const input: CadAgentInput = {
        context: mockContext,
        userMessage: 'Create a simple box',
        projectId: 'project-123',
        newProjectName: 'My Project',
        constraints: { units: 'mm' },
      };
      expect(input.context).toBe(mockContext);
      expect(input.userMessage).toBe('Create a simple box');
      expect(input.projectId).toBe('project-123');
      expect(input.newProjectName).toBe('My Project');
      expect(input.constraints?.units).toBe('mm');
    });

    it('should accept minimal input with only required fields', () => {
      const input: CadAgentInput = {
        context: mockContext,
        userMessage: 'Create a sphere',
      };
      expect(input.context).toBe(mockContext);
      expect(input.userMessage).toBe('Create a sphere');
      expect(input.projectId).toBeUndefined();
      expect(input.newProjectName).toBeUndefined();
      expect(input.constraints).toBeUndefined();
    });
  });

  describe('CadAgentResult interface', () => {
    it('should have all required and optional fields', () => {
      const result: CadAgentResult = {
        conversationId: 'conv-123',
        status: 'completed',
        userMessage: 'Create a box',
        generatedCode: 'function createModel(oc) { ... }',
        outputs: { step: 'https://example.com/model.step' },
        meshStats: { vertices: 8, faces: 12 },
        error: undefined,
        duration: 1500,
      };
      expect(result.conversationId).toBe('task-123');
      expect(result.status).toBe('completed');
      expect(result.duration).toBe(1500);
    });

    it('should allow failed status with error', () => {
      const result: CadAgentResult = {
        conversationId: 'conv-456',
        status: 'failed',
        userMessage: 'Create a box',
        error: 'LLM call failed',
        duration: 500,
      };
      expect(result.status).toBe('failed');
      expect(result.error).toBe('LLM call failed');
    });

    it('should allow completed status without optional fields', () => {
      const result: CadAgentResult = {
        conversationId: 'conv-789',
        status: 'completed',
        userMessage: 'Create a cylinder',
        duration: 2000,
      };
      expect(result.generatedCode).toBeUndefined();
      expect(result.outputs).toBeUndefined();
      expect(result.meshStats).toBeUndefined();
    });
  });

  describe('CadAgentStatus interface', () => {
    it('should have all required and optional fields', () => {
      const status: CadAgentStatus = {
        conversationId: 'conv-123',
        status: 'completed',
        userMessage: 'Create a box',
        executionStatus: 'completed',
        isCodeValid: true,
        outputs: { step: 'https://example.com/model.step' },
        error: undefined,
      };
      expect(status.conversationId).toBe('task-123');
      expect(status.status).toBe('completed');
      expect(status.executionStatus).toBe('completed');
      expect(status.isCodeValid).toBe(true);
    });

    it('should support all status values', () => {
      const statuses: CadAgentStatus['status'][] = [
        'pending',
        'generating',
        'validating',
        'executing',
        'exporting',
        'completed',
        'failed',
      ];
      for (const s of statuses) {
        const status: CadAgentStatus = {
          conversationId: 'conv-123',
          status: s,
          userMessage: 'Test',
          executionStatus: 'pending',
        };
        expect(status.status).toBe(s);
      }
    });

    it('should support all executionStatus values', () => {
      const execStatuses: CadAgentStatus['executionStatus'][] = [
        'pending',
        'executing',
        'completed',
        'failed',
      ];
      for (const es of execStatuses) {
        const status: CadAgentStatus = {
          conversationId: 'conv-123',
          status: 'pending',
          userMessage: 'Test',
          executionStatus: es,
        };
        expect(status.executionStatus).toBe(es);
      }
    });

    it('should allow minimal status without optional fields', () => {
      const status: CadAgentStatus = {
        conversationId: 'conv-123',
        status: 'pending',
        userMessage: 'Create a box',
        executionStatus: 'pending',
      };
      expect(status.isCodeValid).toBeUndefined();
      expect(status.outputs).toBeUndefined();
      expect(status.error).toBeUndefined();
    });
  });
});
