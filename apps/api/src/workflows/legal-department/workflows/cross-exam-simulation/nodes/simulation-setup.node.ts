/**
 * Simulation Setup Node — analyzes case facts to build a SimulationStrategy
 * (prioritized topic list, document confrontation map, witness vulnerabilities)
 * that the question generator uses to drive the simulated cross-examination.
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import { stripMarkdownFences } from '../../../nodes/specialist-utils';
import type { CrossExamSimulationState } from '../cross-exam-simulation.state';
import type { SimulationStrategy } from '../cross-exam-simulation.types';

const SIMULATION_SETUP_SYSTEM_PROMPT = `You are an opposing counsel preparing to depose a witness. Based on the case facts, witness background, and any prior statements, build a cross-examination strategy.

Identify:
1. **Topics** (ordered by priority, most damaging first): Key areas to probe during cross-examination.
2. **Document Confrontation Map**: For each key document, provide a template confrontation question. Keys are document names.
3. **Witness Vulnerabilities**: Specific weak points in the witness's likely testimony (prior inconsistencies, knowledge gaps, bias, motive to lie).

Respond ONLY with valid JSON matching this schema:
{
  "topics": ["topic1", "topic2", ...],
  "documentConfrontationMap": { "documentName": "confrontation question template", ... },
  "witnessVulnerabilities": ["vulnerability1", ...]
}`;

export function createSimulationSetupNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function simulationSetupNode(
    state: CrossExamSimulationState,
  ): Promise<Partial<CrossExamSimulationState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Opposing counsel is preparing cross-examination strategy...',
      { step: 'simulation_setup', progress: 10 },
    );

    const { input } = state;

    const documentSection =
      input.documents && input.documents.length > 0
        ? `\n\nDOCUMENTS:\n${input.documents.map((d) => `--- ${d.name} ---\n${d.content}`).join('\n\n')}`
        : '';

    const userMessage = `CASE FACTS:\n${input.caseFacts}

WITNESS BACKGROUND:\n${input.witnessBackground}${input.priorStatements ? `\n\nPRIOR STATEMENTS:\n${input.priorStatements}` : ''}${input.simulationFocus ? `\n\nSIMULATION FOCUS:\n${input.simulationFocus}` : ''}${documentSection}`;

    const response = await callLLMMaybeWithReasoning(llmClient, {
      context: ctx,
      systemMessage: SIMULATION_SETUP_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.2,
      maxTokens: 3000,
      callerName: 'cross-exam-simulation:setup',
    });

    let simulationStrategy: SimulationStrategy;
    try {
      simulationStrategy = JSON.parse(
        stripMarkdownFences(response.text),
      ) as SimulationStrategy;
    } catch {
      return {
        error: `Failed to parse simulation strategy response as JSON: ${response.text.slice(0, 200)}`,
        status: 'failed',
      };
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Strategy built: ${simulationStrategy.topics.length} topics, ${simulationStrategy.witnessVulnerabilities.length} vulnerabilities identified`,
      { step: 'simulation_setup_complete', progress: 20 },
    );

    return {
      simulationStrategy,
      currentTopic: simulationStrategy.topics[0],
    };
  };
}
