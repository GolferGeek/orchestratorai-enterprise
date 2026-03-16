import { StateGraph, END } from '@langchain/langgraph';
import { AIMessage } from '@langchain/core/messages';
import { v4 as uuidv4 } from 'uuid';
import {
  MarketingSwarmStateAnnotation,
  MarketingSwarmState,
  QueueItem,
  SwarmOutput,
  SwarmEvaluation,
} from './marketing-swarm.state';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';

const AGENT_SLUG = 'marketing-swarm';

/**
 * Create the Marketing Swarm graph
 *
 * Minimal Phase 1 Flow:
 * 1. Initialize → Build execution queue
 * 2. Process Writers → Generate initial drafts
 * 3. Process Editors → Review and refine (single cycle for Phase 1)
 * 4. Process Evaluators → Score outputs
 * 5. Rank → Rank by scores
 * 6. Complete → Done
 */
export async function createMarketingSwarmGraph(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  checkpointer: PostgresCheckpointerService,
) {
  // Helper: Build prompt for writer
  function buildWriterPrompt(state: MarketingSwarmState): string {
    const { promptData, contentTypeContext } = state;
    return `${contentTypeContext}

## Content Brief

**Topic**: ${promptData.topic}
**Target Audience**: ${promptData.audience}
**Goal**: ${promptData.goal}
**Tone**: ${promptData.tone}

**Key Points to Cover**:
${promptData.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

${promptData.constraints ? `**Constraints**: ${promptData.constraints}` : ''}
${promptData.examples ? `**Style Examples**: ${promptData.examples}` : ''}
${promptData.additionalContext ? `**Additional Context**: ${promptData.additionalContext}` : ''}

Please write the content based on this brief.`;
  }

  // Helper: Build prompt for editor
  function buildEditorPrompt(
    state: MarketingSwarmState,
    output: SwarmOutput,
    editorPersonality: string,
  ): string {
    return `${editorPersonality}

## Content to Review

${output.content}

## Original Brief

**Topic**: ${state.promptData.topic}
**Target Audience**: ${state.promptData.audience}
**Goal**: ${state.promptData.goal}
**Tone**: ${state.promptData.tone}

## Your Task

1. Review the content against the brief and your editorial focus
2. Provide specific, actionable feedback
3. Decide whether to APPROVE or REQUEST CHANGES

If requesting changes, explain what needs to be improved.
If approving, briefly note what makes it good.

Format your response as:
**Decision**: APPROVE or REQUEST_CHANGES
**Feedback**: Your detailed feedback
**Revised Content** (if requesting changes): The improved version`;
  }

  // Helper: Build prompt for evaluator
  function buildEvaluatorPrompt(
    state: MarketingSwarmState,
    output: SwarmOutput,
    evaluatorPersonality: string,
  ): string {
    return `${evaluatorPersonality}

## Content to Evaluate

${output.content}

## Original Brief

**Topic**: ${state.promptData.topic}
**Target Audience**: ${state.promptData.audience}
**Goal**: ${state.promptData.goal}
**Tone**: ${state.promptData.tone}

## Your Task

Score this content from 1-10 based on your evaluation criteria.
Provide detailed reasoning for your score.

Format your response as:
**Score**: [1-10]
**Reasoning**: Your detailed evaluation`;
  }

  // Node: Initialize and build execution queue
  async function initializeNode(
    state: MarketingSwarmState,
  ): Promise<Partial<MarketingSwarmState>> {
    const ctx = state.executionContext;

    await observability.emitStarted(
      ctx,
      ctx.conversationId,
      `Starting Marketing Swarm for: ${state.promptData.topic}`,
    );

    // Build execution queue
    const queue: QueueItem[] = [];
    let sequence = 0;

    // 1. Add all writer steps
    const writerStepIds: string[] = [];
    for (const writer of state.config.writers) {
      const stepId = uuidv4();
      writerStepIds.push(stepId);
      queue.push({
        id: stepId,
        stepType: 'write',
        sequence: sequence++,
        agentSlug: writer.agentSlug,
        llmConfigId: writer.llmConfigId,
        provider: writer.llmProvider,
        dependsOn: [],
        status: 'pending',
      });
    }

    // 2. Add editor steps for each writer output × editor combination
    const editorStepIds: string[] = [];
    for (let i = 0; i < writerStepIds.length; i++) {
      const writerStepId = writerStepIds[i]!;
      for (const editor of state.config.editors) {
        const stepId = uuidv4();
        editorStepIds.push(stepId);
        queue.push({
          id: stepId,
          stepType: 'edit',
          sequence: sequence++,
          agentSlug: editor.agentSlug,
          llmConfigId: editor.llmConfigId,
          provider: editor.llmProvider,
          dependsOn: [writerStepId],
          inputOutputId: writerStepId, // Will be replaced with actual output ID
          status: 'pending',
        });
      }
    }

    // 3. Add evaluator steps for each output × evaluator combination
    // For Phase 1, evaluators run after all editing is done
    for (const evaluator of state.config.evaluators) {
      queue.push({
        id: uuidv4(),
        stepType: 'evaluate',
        sequence: sequence++,
        agentSlug: evaluator.agentSlug,
        llmConfigId: evaluator.llmConfigId,
        provider: evaluator.llmProvider,
        dependsOn: editorStepIds, // Depends on all editing being done
        status: 'pending',
      });
    }

    await observability.emitProgress(ctx, ctx.conversationId, 'Execution queue built', {
      step: 'queue_built',
      progress: 5,
      metadata: {
        totalSteps: queue.length,
        writers: state.config.writers.length,
        editors: state.config.editors.length,
        evaluators: state.config.evaluators.length,
      },
    });

    return {
      executionQueue: queue,
      phase: 'writing',
      startedAt: Date.now(),
    };
  }

  // Node: Process writer steps
  async function processWritersNode(
    state: MarketingSwarmState,
  ): Promise<Partial<MarketingSwarmState>> {
    const ctx = state.executionContext;
    const queue = [...state.executionQueue];
    const outputs: SwarmOutput[] = [];

    const writerSteps = queue.filter(
      (q) => q.stepType === 'write' && q.status === 'pending',
    );

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Processing ${writerSteps.length} writer agents`,
      {
        step: 'writing',
        progress: 10,
      },
    );

    // Process writers sequentially for Phase 1 (parallel in Phase 2)
    for (const step of writerSteps) {
      const stepIndex = queue.findIndex((q) => q.id === step.id);
      queue[stepIndex] = {
        ...step,
        status: 'processing',
        startedAt: Date.now(),
      };

      try {
        // Find writer config
        const writerConfig = state.config.writers.find(
          (w) =>
            w.agentSlug === step.agentSlug &&
            w.llmConfigId === step.llmConfigId,
        );

        // Create a context with the writer's LLM config
        const writerContext = {
          ...ctx,
          provider: writerConfig?.llmProvider || ctx.provider,
          model: writerConfig?.llmModel || ctx.model,
        };

        await observability.emitProgress(
          ctx,
          ctx.conversationId,
          `Writer ${step.agentSlug} generating draft`,
          {
            step: 'writer_started',
            metadata: { agentSlug: step.agentSlug },
          },
        );

        const startTime = Date.now();
        const response = await llmClient.callLLM({
          context: writerContext,
          userMessage: buildWriterPrompt(state),
          callerName: `${AGENT_SLUG}:${step.agentSlug}`,
        });

        const outputId = uuidv4();
        const output: SwarmOutput = {
          id: outputId,
          writerAgentSlug: step.agentSlug,
          writerLlmConfigId: step.llmConfigId,
          content: response.text,
          editCycle: 0,
          status: 'draft',
          llmMetadata: {
            tokensUsed: response.usage?.totalTokens,
            latencyMs: Date.now() - startTime,
          },
        };

        outputs.push(output);

        // Update queue with result
        queue[stepIndex] = {
          ...queue[stepIndex],
          status: 'completed',
          resultId: outputId,
          completedAt: Date.now(),
        };

        // Update editor steps that depend on this writer
        for (let i = 0; i < queue.length; i++) {
          if (
            queue[i]!.stepType === 'edit' &&
            queue[i]!.dependsOn.includes(step.id)
          ) {
            queue[i] = { ...queue[i]!, inputOutputId: outputId };
          }
        }

        await observability.emitProgress(
          ctx,
          ctx.conversationId,
          `Writer ${step.agentSlug} completed draft`,
          {
            step: 'writer_completed',
            metadata: {
              agentSlug: step.agentSlug,
              outputId,
              contentLength: response.text.length,
            },
          },
        );
      } catch (error) {
        queue[stepIndex] = {
          ...queue[stepIndex],
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          completedAt: Date.now(),
        };
      }
    }

    const _progress =
      10 + (writerSteps.length / state.executionQueue.length) * 30;

    return {
      executionQueue: queue,
      outputs,
      phase: 'editing',
      messages: [
        ...state.messages,
        new AIMessage(`Generated ${outputs.length} initial drafts`),
      ],
    };
  }

  // Node: Process editor steps
  async function processEditorsNode(
    state: MarketingSwarmState,
  ): Promise<Partial<MarketingSwarmState>> {
    const ctx = state.executionContext;
    const queue = [...state.executionQueue];
    const updatedOutputs: SwarmOutput[] = [];

    const editorSteps = queue.filter(
      (q) => q.stepType === 'edit' && q.status === 'pending' && q.inputOutputId,
    );

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Processing ${editorSteps.length} editor reviews`,
      {
        step: 'editing',
        progress: 40,
      },
    );

    // Process editors sequentially for Phase 1
    for (const step of editorSteps) {
      const stepIndex = queue.findIndex((q) => q.id === step.id);

      // Find the output to edit
      const output = state.outputs.find((o) => o.id === step.inputOutputId);
      if (!output) {
        queue[stepIndex] = {
          ...step,
          status: 'skipped',
          error: 'Output not found',
          completedAt: Date.now(),
        };
        continue;
      }

      queue[stepIndex] = {
        ...step,
        status: 'processing',
        startedAt: Date.now(),
      };

      try {
        const editorConfig = state.config.editors.find(
          (e) =>
            e.agentSlug === step.agentSlug &&
            e.llmConfigId === step.llmConfigId,
        );

        const editorContext = {
          ...ctx,
          provider: editorConfig?.llmProvider || ctx.provider,
          model: editorConfig?.llmModel || ctx.model,
        };

        await observability.emitProgress(
          ctx,
          ctx.conversationId,
          `Editor ${step.agentSlug} reviewing draft`,
          {
            step: 'editor_started',
            metadata: { agentSlug: step.agentSlug, outputId: output.id },
          },
        );

        const startTime = Date.now();

        // TODO: Fetch actual editor personality from DB
        const editorPersonality = `You are an editor focused on improving content quality.`;

        const response = await llmClient.callLLM({
          context: editorContext,
          userMessage: buildEditorPrompt(state, output, editorPersonality),
          callerName: `${AGENT_SLUG}:${step.agentSlug}`,
        });

        // Parse editor response
        const approved = response.text.includes('APPROVE');
        const feedbackMatch = response.text.match(
          /\*\*Feedback\*\*:\s*([\s\S]*?)(?=\*\*|$)/i,
        );
        const revisedMatch = response.text.match(
          /\*\*Revised Content\*\*:\s*([\s\S]*?)$/i,
        );

        const updatedOutput: SwarmOutput = {
          ...output,
          editorAgentSlug: step.agentSlug,
          editorLlmConfigId: step.llmConfigId,
          editCycle: output.editCycle + 1,
          editorFeedback: feedbackMatch
            ? feedbackMatch[1]!.trim()
            : response.text,
          editorApproved: approved,
          status: approved ? 'approved' : 'editing',
          content: revisedMatch ? revisedMatch[1]!.trim() : output.content,
          llmMetadata: {
            tokensUsed: response.usage?.totalTokens,
            latencyMs: Date.now() - startTime,
          },
        };

        updatedOutputs.push(updatedOutput);

        queue[stepIndex] = {
          ...queue[stepIndex],
          status: 'completed',
          completedAt: Date.now(),
        };

        await observability.emitProgress(
          ctx,
          ctx.conversationId,
          `Editor ${step.agentSlug} ${approved ? 'approved' : 'revised'} draft`,
          {
            step: 'editor_completed',
            metadata: {
              agentSlug: step.agentSlug,
              outputId: output.id,
              approved,
            },
          },
        );
      } catch (error) {
        queue[stepIndex] = {
          ...queue[stepIndex],
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          completedAt: Date.now(),
        };
      }
    }

    return {
      executionQueue: queue,
      outputs: updatedOutputs,
      phase: 'evaluating',
    };
  }

  // Node: Process evaluator steps
  async function processEvaluatorsNode(
    state: MarketingSwarmState,
  ): Promise<Partial<MarketingSwarmState>> {
    const ctx = state.executionContext;
    const queue = [...state.executionQueue];
    const evaluations: SwarmEvaluation[] = [];

    const evaluatorSteps = queue.filter(
      (q) => q.stepType === 'evaluate' && q.status === 'pending',
    );

    // Get all outputs that are ready for evaluation (approved or final)
    const outputsToEvaluate = state.outputs.filter(
      (o) =>
        o.status === 'approved' || o.status === 'final' || o.status === 'draft',
    );

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Processing ${evaluatorSteps.length} evaluators on ${outputsToEvaluate.length} outputs`,
      {
        step: 'evaluating',
        progress: 70,
      },
    );

    // Each evaluator evaluates each output
    for (const step of evaluatorSteps) {
      const stepIndex = queue.findIndex((q) => q.id === step.id);
      queue[stepIndex] = {
        ...step,
        status: 'processing',
        startedAt: Date.now(),
      };

      const evaluatorConfig = state.config.evaluators.find(
        (e) =>
          e.agentSlug === step.agentSlug && e.llmConfigId === step.llmConfigId,
      );

      const evaluatorContext = {
        ...ctx,
        provider: evaluatorConfig?.llmProvider || ctx.provider,
        model: evaluatorConfig?.llmModel || ctx.model,
      };

      // TODO: Fetch actual evaluator personality from DB
      const evaluatorPersonality = `You are an evaluator focused on content quality.`;

      for (const output of outputsToEvaluate) {
        try {
          await observability.emitProgress(
            ctx,
            ctx.conversationId,
            `Evaluator ${step.agentSlug} scoring output`,
            {
              step: 'evaluator_started',
              metadata: { agentSlug: step.agentSlug, outputId: output.id },
            },
          );

          const startTime = Date.now();
          const response = await llmClient.callLLM({
            context: evaluatorContext,
            userMessage: buildEvaluatorPrompt(
              state,
              output,
              evaluatorPersonality,
            ),
            callerName: `${AGENT_SLUG}:${step.agentSlug}`,
          });

          // Parse score from response
          const scoreMatch = response.text.match(/\*\*Score\*\*:\s*(\d+)/i);
          const reasoningMatch = response.text.match(
            /\*\*Reasoning\*\*:\s*([\s\S]*?)$/i,
          );

          const evaluation: SwarmEvaluation = {
            id: uuidv4(),
            outputId: output.id,
            evaluatorAgentSlug: step.agentSlug,
            evaluatorLlmConfigId: step.llmConfigId,
            score: scoreMatch ? parseInt(scoreMatch[1]!, 10) : 5,
            reasoning: reasoningMatch
              ? reasoningMatch[1]!.trim()
              : response.text,
            llmMetadata: {
              tokensUsed: response.usage?.totalTokens,
              latencyMs: Date.now() - startTime,
            },
          };

          evaluations.push(evaluation);

          await observability.emitProgress(
            ctx,
            ctx.conversationId,
            `Evaluator ${step.agentSlug} scored output: ${evaluation.score}/10`,
            {
              step: 'evaluator_completed',
              metadata: {
                agentSlug: step.agentSlug,
                outputId: output.id,
                score: evaluation.score,
              },
            },
          );
        } catch (error) {
          // Log but continue with other evaluations
          console.error(
            `Evaluation failed for ${step.agentSlug} on ${output.id}:`,
            error,
          );
        }
      }

      queue[stepIndex] = {
        ...queue[stepIndex],
        status: 'completed',
        completedAt: Date.now(),
      };
    }

    return {
      executionQueue: queue,
      evaluations,
      phase: 'ranking',
    };
  }

  // Node: Rank outputs by evaluation scores
  async function rankOutputsNode(
    state: MarketingSwarmState,
  ): Promise<Partial<MarketingSwarmState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Ranking outputs by scores',
      {
        step: 'ranking',
        progress: 90,
      },
    );

    // Calculate average score per output
    const outputScores = state.outputs.map((output) => {
      const outputEvals = state.evaluations.filter(
        (e) => e.outputId === output.id,
      );
      const avgScore =
        outputEvals.length > 0
          ? outputEvals.reduce((sum, e) => sum + e.score, 0) /
            outputEvals.length
          : 0;
      return {
        outputId: output.id,
        averageScore: Math.round(avgScore * 10) / 10,
      };
    });

    // Sort by average score descending
    outputScores.sort((a, b) => b.averageScore - a.averageScore);

    // Mark top output as final
    const finalOutputs = state.outputs.map((o) => {
      if (outputScores[0]?.outputId === o.id) {
        return { ...o, status: 'final' as const };
      }
      return o;
    });

    await observability.emitCompleted(ctx, ctx.conversationId, {
      rankedResults: outputScores,
      totalOutputs: state.outputs.length,
      totalEvaluations: state.evaluations.length,
    });

    return {
      outputs: finalOutputs,
      phase: 'completed',
      completedAt: Date.now(),
      messages: [
        ...state.messages,
        new AIMessage(
          `Completed! Best output scored ${outputScores[0]?.averageScore}/10`,
        ),
      ],
    };
  }

  // Node: Handle errors
  async function handleErrorNode(
    state: MarketingSwarmState,
  ): Promise<Partial<MarketingSwarmState>> {
    const ctx = state.executionContext;

    await observability.emitFailed(
      ctx,
      ctx.conversationId,
      state.error || 'Unknown error',
      Date.now() - state.startedAt,
    );

    return {
      phase: 'failed',
      completedAt: Date.now(),
    };
  }

  // Build the graph
  const graph = new StateGraph(MarketingSwarmStateAnnotation)
    .addNode('initialize', initializeNode)
    .addNode('process_writers', processWritersNode)
    .addNode('process_editors', processEditorsNode)
    .addNode('process_evaluators', processEvaluatorsNode)
    .addNode('rank_outputs', rankOutputsNode)
    .addNode('handle_error', handleErrorNode)
    // Edges
    .addEdge('__start__', 'initialize')
    .addConditionalEdges('initialize', (state) => {
      if (state.error) return 'handle_error';
      if (state.config.writers.length === 0) {
        return 'handle_error';
      }
      return 'process_writers';
    })
    .addConditionalEdges('process_writers', (state) => {
      if (state.error) return 'handle_error';
      if (state.outputs.length === 0) return 'handle_error';
      if (state.config.editors.length === 0) return 'process_evaluators';
      return 'process_editors';
    })
    .addConditionalEdges('process_editors', (state) => {
      if (state.error) return 'handle_error';
      if (state.config.evaluators.length === 0) return 'rank_outputs';
      return 'process_evaluators';
    })
    .addEdge('process_evaluators', 'rank_outputs')
    .addEdge('rank_outputs', END)
    .addEdge('handle_error', END);

  // Compile with checkpointer
  return graph.compile({
    checkpointer: await checkpointer.getSaver(),
  });
}

export type MarketingSwarmGraph = ReturnType<typeof createMarketingSwarmGraph>;
