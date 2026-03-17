/**
 * Unit tests for CadAgentRequestDto
 *
 * Tests the DTO class definition and ensures fields are correctly typed.
 */
import { CadAgentRequestDto } from './cad-agent-request.dto';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

describe('CadAgentRequestDto', () => {
  const mockContext = createMockExecutionContext({
    userId: 'user-456',
    orgSlug: 'test-org',
    conversationId: 'conv-123',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
  });

  it('should create an instance of CadAgentRequestDto', () => {
    const dto = new CadAgentRequestDto();
    expect(dto).toBeDefined();
    expect(dto).toBeInstanceOf(CadAgentRequestDto);
  });

  it('should accept all required fields when assigned', () => {
    const dto = new CadAgentRequestDto();
    dto.context = mockContext;
    dto.userMessage = 'Create a simple box 10x10x10';

    expect(dto.context).toBe(mockContext);
    expect(dto.userMessage).toBe('Create a simple box 10x10x10');
  });

  it('should accept all optional fields when assigned', () => {
    const dto = new CadAgentRequestDto();
    dto.context = mockContext;
    dto.userMessage = 'Create a cylinder';
    dto.projectId = 'project-123';
    dto.newProjectName = 'My CAD Project';
    dto.constraints = { units: 'mm', material: 'steel' };
    dto.outputFormats = ['step', 'stl', 'gltf'];

    expect(dto.projectId).toBe('project-123');
    expect(dto.newProjectName).toBe('My CAD Project');
    expect(dto.constraints?.units).toBe('mm');
    expect(dto.constraints?.material).toBe('steel');
    expect(dto.outputFormats).toEqual(['step', 'stl', 'gltf']);
  });

  it('should allow optional fields to be undefined', () => {
    const dto = new CadAgentRequestDto();
    dto.context = mockContext;
    dto.userMessage = 'Create a sphere';

    expect(dto.projectId).toBeUndefined();
    expect(dto.newProjectName).toBeUndefined();
    expect(dto.constraints).toBeUndefined();
    expect(dto.outputFormats).toBeUndefined();
  });

  it('should allow constraints with various fields', () => {
    const dto = new CadAgentRequestDto();
    dto.context = mockContext;
    dto.userMessage = 'Create a bracket';
    dto.constraints = {
      units: 'mm',
      material: 'aluminum',
      manufacturing_method: 'cnc',
      tolerance_class: 'A',
      wall_thickness_min: 2.0,
    };

    expect(dto.constraints.units).toBe('mm');
    expect(dto.constraints.material).toBe('aluminum');
    expect(dto.constraints.manufacturing_method).toBe('cnc');
    expect(dto.constraints.tolerance_class).toBe('A');
    expect(dto.constraints.wall_thickness_min).toBe(2.0);
  });

  it('should support multiple output format strings', () => {
    const dto = new CadAgentRequestDto();
    dto.context = mockContext;
    dto.userMessage = 'Create a part';
    dto.outputFormats = ['step', 'stl'];

    expect(dto.outputFormats).toHaveLength(2);
    expect(dto.outputFormats).toContain('step');
    expect(dto.outputFormats).toContain('stl');
  });
});
