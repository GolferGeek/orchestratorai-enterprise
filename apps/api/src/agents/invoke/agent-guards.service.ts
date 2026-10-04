import { Injectable } from '@nestjs/common';
import type { InvokeData, InvokeOutput } from '@orchestrator-ai/transport-types';
import { DecisionsService } from '../../decisions';
import type { AgentDefinition } from './agent-definition.types';

/** One guard's verdict, as it travels in `output.metadata.guards`. */
export interface AgentGuardVerdict {
  rubric: string;
  decision: 'pass' | 'review' | 'block';
  reason: string | null;
  answers: Record<string, unknown>;
}

/**
 * Jev post-guards for agents (metadata.jev_guards): after the agent answers,
 * each rubric reads the answer (and, where declared, the user's message) and
 * returns a verdict. The answer is never rewritten or hidden - the person sees
 * it with the verdicts beside it. A guard that cannot run fails the call.
 */
@Injectable()
export class AgentGuardsService {
  constructor(private readonly decisions: DecisionsService) {}

  async apply(definition: AgentDefinition, data: InvokeData, output: InvokeOutput): Promise<InvokeOutput> {
    if (!definition.guards) return output;
    const answer = typeof output.content === 'string' ? output.content : JSON.stringify(output.content);
    const message = userMessage(data);
    const verdicts: AgentGuardVerdict[] = [];
    for (const guard of definition.guards) {
      const inputs = Object.fromEntries(
        Object.entries(guard.inputs).map(([name, source]) => [name, source === 'output' ? answer : message]),
      );
      const result = await this.decisions.check(guard.rubric, inputs);
      verdicts.push({ rubric: result.rubric, decision: result.decision, reason: result.reason, answers: result.answers });
    }
    return { ...output, metadata: { ...output.metadata, guards: verdicts } };
  }
}

function userMessage(data: InvokeData): string {
  if (typeof data.content === 'string') return data.content;
  if (data.content && typeof data.content === 'object') {
    const message = (data.content as Record<string, unknown>).message;
    if (typeof message === 'string') return message;
  }
  throw new Error('A guarded agent needs the user message as text (data.content or data.content.message)');
}
