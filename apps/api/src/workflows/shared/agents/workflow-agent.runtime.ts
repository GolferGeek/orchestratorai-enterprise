import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  WorkflowLlmClient,
  type RoleCallResult,
  type RunModelScope,
} from '../models/workflow-llm.client';
import { AgentContract } from './agent-contract';
import type { AgentDefinition } from './agent-definition.types';
import { AgentDefinitionsRepository } from './agent-definitions.repository';
import { AgentInputError, AgentOutputError, AgentUnavailableError } from './agent-errors';
import { readAgentAnswer } from './agent-output.parser';

export interface AgentInvocation<TOutput> {
  output: TOutput;
  /** The definition version that ran (recorded on the participant). */
  definitionVersion: number;
  modelRole: string;
  call: RoleCallResult;
}

/**
 * Runs an agent definition as one model call: strict input check, the
 * agent's instructions (plus its output schema for JSON agents), the model
 * of its role from the run's profile, and a strict output check.
 *
 * Every definition's schemas are compiled at boot; one that does not compile
 * stops the API rather than failing later or validating permissively.
 */
@Injectable()
export class WorkflowAgentRuntime implements OnModuleInit {
  private readonly logger = new Logger(WorkflowAgentRuntime.name);
  private readonly contract = new AgentContract();

  constructor(
    private readonly definitions: AgentDefinitionsRepository,
    private readonly llm: WorkflowLlmClient,
  ) {}

  async onModuleInit(): Promise<void> {
    const all = await this.definitions.listAll();
    for (const definition of all) this.compile(definition);
    this.logger.log(`Compiled the schemas of ${all.length} agent definition(s)`);
  }

  async invoke<TOutput>(
    scope: RunModelScope,
    agentSlug: string,
    input: unknown,
  ): Promise<AgentInvocation<TOutput>> {
    const definition = await this.definitions.getForOrg(agentSlug, scope.executionContext.orgSlug);
    if (!definition) throw new AgentUnavailableError(agentSlug, 'does not exist');
    if (!definition.enabled) {
      throw new AgentUnavailableError(agentSlug, `is disabled for organization "${scope.executionContext.orgSlug}"`);
    }
    const { validateInput, validateOutput } = this.compile(definition);

    const inputIssues = AgentContract.check(validateInput, input);
    if (inputIssues) throw new AgentInputError(agentSlug, inputIssues);

    const call = await this.llm.callForRole(scope, definition.modelRole, {
      systemPrompt: systemPrompt(definition),
      userMessage: JSON.stringify(input, null, 2),
      callerName: `agent:${agentSlug}`,
      maxTokens: definition.maxTokens,
      ...(definition.outputFormat === 'json' ? { responseFormat: 'json' as const } : {}),
    });

    const answer = readAgentAnswer(definition.outputFormat, call.content);
    if ('issue' in answer) throw new AgentOutputError(agentSlug, [answer.issue], call.content, call);
    if (validateOutput) {
      const outputIssues = AgentContract.check(validateOutput, answer.value);
      if (outputIssues) throw new AgentOutputError(agentSlug, outputIssues, call.content, call);
    }
    return {
      output: answer.value as TOutput,
      definitionVersion: definition.version,
      modelRole: definition.modelRole,
      call,
    };
  }

  private compile(definition: AgentDefinition) {
    const key = `${definition.slug}@${definition.version}`;
    return {
      validateInput: this.contract.compile(
        `${key}:input`,
        `Agent "${definition.slug}" input schema`,
        definition.inputSchema,
      ),
      validateOutput: definition.outputSchema
        ? this.contract.compile(
            `${key}:output`,
            `Agent "${definition.slug}" output schema`,
            definition.outputSchema,
          )
        : null,
    };
  }
}

function systemPrompt(definition: AgentDefinition): string {
  if (definition.outputFormat === 'text') return definition.instructions;
  return [
    definition.instructions,
    'Respond with one JSON object and nothing else. It must match this JSON Schema exactly:',
    JSON.stringify(definition.outputSchema, null, 2),
  ].join('\n\n');
}
