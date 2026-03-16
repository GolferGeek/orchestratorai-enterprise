import { AgentRuntimeRedactionService } from './agent-runtime-redaction.service';
import { RedactionPatternsRepository } from '../repositories/redaction-patterns.repository';
import { AgentRuntimeDefinition } from '../interfaces/agent.interface';
import {
  TaskRequestDto,
  AgentTaskMode,
} from '@agent2agent/dto/task-request.dto';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

describe('AgentRuntimeRedactionService', () => {
  const makeService = (
    patterns: Array<{ pattern: string; flags?: string; replacement?: string }>,
  ) => {
    const repo = {
      listByOrganization: jest.fn().mockResolvedValue(
        patterns.map((p) => ({
          id: '1',
          organization_slug: 'demo',
          agent_slug: null,
          pattern: p.pattern,
          flags: p.flags ?? 'gi',
          replacement: p.replacement ?? '[REDACTED]',
        })),
      ),
    } as unknown as jest.Mocked<RedactionPatternsRepository>;
    return new AgentRuntimeRedactionService(repo);
  };

  const definition: AgentRuntimeDefinition = {
    slug: 'agent',
    organizationSlug: ['demo'],
    name: 'Agent',
    description: 'Test agent',
    agentType: 'context',
    department: 'test',
    tags: [],
    metadata: { tags: [] },
    capabilities: [],
    skills: [],
    communication: { inputModes: ['text'], outputModes: ['text'] },
    execution: {
      modeProfile: 'converse_only',
      canConverse: true,
      canPlan: false,
      canBuild: false,
      canOrchestrate: false,
      requiresHumanGate: false,
    },
    prompts: { system: '', plan: '', build: '', human: '' },
    context: null,
    config: null,
    ioSchema: null,
    record: {
      slug: 'agent',
      organization_slug: ['demo'],
      name: 'Agent',
      description: 'Test agent',
      version: '1.0.0',
      agent_type: 'context',
      department: 'test',
      tags: [],
      io_schema: {},
      capabilities: [],
      context: '',
      endpoint: null,
      llm_config: null,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };

  it('applies DB regex only on remote (isLocal=false) and always applies secret masking', async () => {
    const service = makeService([{ pattern: 'secret', replacement: '[DB]' }]);
    const mockContext = createMockExecutionContext({
      orgSlug: 'demo',
      conversationId: 'test-conv-123',
    });
    const request: TaskRequestDto = {
      context: mockContext,
      mode: AgentTaskMode.CONVERSE,
      userMessage: 'my secret is ALPHA and key sk-ABCDEFGHIJKL',
      payload: {},
    };

    // Local route: DB redaction skipped, secret token masked
    const localRedacted = await service.redact(definition, request, {
      isLocal: true,
      organizationSlug: 'demo',
    });
    expect(localRedacted.userMessage).toContain('secret');
    expect(localRedacted.userMessage).toContain('sk-REDACTED');

    // Remote route: DB redaction applied, secret token masked
    const remoteRedacted = await service.redact(definition, request, {
      isLocal: false,
      organizationSlug: 'demo',
    });
    expect(remoteRedacted.userMessage).toContain('[DB]');
    expect(remoteRedacted.userMessage).not.toContain('secret');
    expect(remoteRedacted.userMessage).toContain('sk-REDACTED');
  });
});
