import type { InvokeOutput } from '@orchestrator-ai/transport-types';
import type { DecisionsService } from '../../decisions';
import type { AgentDefinition } from './agent-definition.types';
import { AgentGuardsService } from './agent-guards.service';

const definition = (guards?: AgentDefinition['guards']) =>
  ({ slug: 'brand-claims-reviewer', agentType: 'context', guards }) as AgentDefinition;
const output: InvokeOutput = { content: 'Cut costs 40%, guaranteed.', outputType: 'text', metadata: { provider: 'openrouter' } };

function setup(fail = false) {
  const check = jest.fn(async (rubric: string, inputs: Record<string, unknown>) => {
    if (fail) throw new Error('decision model unreachable');
    return { rubric, version: 1, decision: 'block', reason: 'unsubstantiated claim', answers: { unsupported: { type: 'noul', noul: 1 } }, model: 'm', usage: { input_tokens: 1, output_tokens: 0 }, inputs };
  });
  return { check, service: new AgentGuardsService({ check } as unknown as DecisionsService) };
}

describe('AgentGuardsService', () => {
  it('feeds each rubric from the answer or the message and puts the verdicts beside the answer', async () => {
    const { service, check } = setup();
    const guarded = await service.apply(
      definition([{ rubric: 'claims-substantiated', inputs: { copy: 'output', evidence: 'message' } }]),
      { content: { message: 'Evidence: none' } },
      output,
    );
    expect(check).toHaveBeenCalledWith('claims-substantiated', { copy: 'Cut costs 40%, guaranteed.', evidence: 'Evidence: none' });
    expect(guarded.content).toBe(output.content);
    expect(guarded.metadata).toEqual({
      provider: 'openrouter',
      guards: [{ rubric: 'claims-substantiated', decision: 'block', reason: 'unsubstantiated claim', answers: { unsupported: { type: 'noul', noul: 1 } } }],
    });
  });

  it('leaves an unguarded agent alone, and fails the call when a guard cannot run', async () => {
    const { service, check } = setup(true);
    await expect(service.apply(definition(), { content: 'hi' }, output)).resolves.toBe(output);
    expect(check).not.toHaveBeenCalled();
    await expect(
      service.apply(definition([{ rubric: 'claims-substantiated', inputs: { copy: 'output' } }]), { content: 'hi' }, output),
    ).rejects.toThrow('unreachable');
  });
});
