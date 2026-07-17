import { Injectable, Logger } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import {
  MarketingDbService,
  ExecutionConfig,
  TaskConfig,
  OutputRow,
  EvaluationRow,
  AgentPersonality,
} from './marketing-db.service';

const AGENT_SLUG = 'marketing-swarm';

/**
 * Phase of the swarm execution
 */
export type SwarmPhase =
  | 'initializing'
  | 'building_queue'
  | 'writing'
  | 'editing'
  | 'evaluating_initial'
  | 'selecting_finalists'
  | 'evaluating_final'
  | 'ranking'
  | 'completed'
  | 'failed';

/**
 * DualTrackProcessorService
 *
 * Implements the database-driven dual-track execution model:
 * - Local (Ollama) jobs run sequentially (up to maxLocalConcurrent)
 * - Cloud jobs run in parallel (up to maxCloudConcurrent)
 * - Both tracks run simultaneously
 */
@Injectable()
export class DualTrackProcessorService {
  private readonly logger = new Logger(DualTrackProcessorService.name);

  constructor(
    private readonly db: MarketingDbService,
    private readonly llmClient: LLMHttpClientService,
    private readonly observability: ObservabilityService,
  ) {}

  /**
   * Main processing loop - database-driven state machine
   */
  async processTask(taskId: string, context: ExecutionContext): Promise<void> {
    this.logger.log(`Starting task processing: ${taskId}`);

    try {
      // Get task config
      const config = await this.db.getTaskConfig(taskId);
      if (!config) {
        throw new Error('Task config not found');
      }

      // Update task status to running
      await this.db.updateTaskStatus(taskId, 'running');

      // Emit started event
      await this.observability.emitStarted(
        context,
        taskId,
        'Marketing Swarm started',
      );

      // Phase 1: Build output matrix
      await this.emitPhaseChange(context, taskId, 'building_queue');
      const outputs = await this.db.buildOutputMatrix(taskId, config);

      await this.emitQueueBuilt(context, taskId, outputs, config);

      // Phase 2: Writing and Editing loop
      await this.emitPhaseChange(context, taskId, 'writing');
      await this.processWritingAndEditing(taskId, context, config);

      // Phase 3: Initial evaluations
      await this.emitPhaseChange(context, taskId, 'evaluating_initial');
      await this.db.buildInitialEvaluations(taskId, config);
      await this.processEvaluations(taskId, context, config, 'initial');

      // Phase 4: Select finalists
      await this.emitPhaseChange(context, taskId, 'selecting_finalists');
      const finalistCount =
        await this.db.calculateInitialRankingsAndSelectFinalists(
          taskId,
          config.execution.topNForFinalRanking,
        );

      await this.emitFinalistsSelected(context, taskId, finalistCount);

      // Phase 5: Final evaluations (if we have finalists)
      if (finalistCount > 0) {
        await this.emitPhaseChange(context, taskId, 'evaluating_final');
        await this.db.buildFinalEvaluations(taskId, config);
        await this.processEvaluations(taskId, context, config, 'final');

        // Phase 6: Calculate final rankings
        await this.emitPhaseChange(context, taskId, 'ranking');
        await this.db.calculateFinalRankings(taskId);
      }

      // Complete
      await this.emitPhaseChange(context, taskId, 'completed');
      await this.db.updateTaskStatus(taskId, 'completed');

      // Emit completed with results
      const allOutputs = await this.db.getAllOutputs(taskId);
      const allEvaluations = await this.db.getAllEvaluations(taskId);

      await this.observability.emitCompleted(context, taskId, {
        totalOutputs: allOutputs.length,
        totalEvaluations: allEvaluations.length,
        winner: allOutputs.find((o) => o.final_rank === 1),
      });

      this.logger.log(`Task completed: ${taskId}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Task failed: ${taskId}, error: ${errorMessage}`);

      await this.db.updateTaskStatus(taskId, 'failed', undefined, errorMessage);
      await this.observability.emitFailed(context, taskId, errorMessage, 0);

      throw error;
    }
  }

  /**
   * Process writing and editing phase using dual-track model
   */
  private async processWritingAndEditing(
    taskId: string,
    context: ExecutionContext,
    config: TaskConfig,
  ): Promise<void> {
    const execution = config.execution;
    let iterationCount = 0;
    const maxIterations = 1000; // Safety limit

    while (iterationCount < maxIterations) {
      iterationCount++;

      // Get current running counts
      const runningCounts = await this.db.getRunningCounts(taskId);

      // Get next actions for both tracks
      const actions = await this.getNextWriteEditActions(
        taskId,
        execution,
        runningCounts,
      );

      if (actions.length === 0) {
        // Check if anything is still in progress
        const stillRunning = runningCounts.local > 0 || runningCounts.cloud > 0;

        if (!stillRunning) {
          // Check if all outputs are complete
          const allComplete = await this.db.areAllOutputsComplete(taskId);
          if (allComplete) {
            break; // Done with writing/editing
          }
        }

        // Wait a bit and check again
        await this.sleep(1000);
        continue;
      }

      // Process all actions concurrently
      await Promise.all(
        actions.map((action) =>
          this.processWriteEditAction(taskId, context, action, config),
        ),
      );
    }
  }

  /**
   * Get next write/edit actions respecting dual-track limits
   */
  private async getNextWriteEditActions(
    taskId: string,
    execution: ExecutionConfig,
    runningCounts: { local: number; cloud: number },
  ): Promise<OutputRow[]> {
    const actions: OutputRow[] = [];

    // Fill local slots
    if (runningCounts.local < execution.maxLocalConcurrent) {
      const slotsAvailable = execution.maxLocalConcurrent - runningCounts.local;
      const localOutputs = await this.db.getNextOutputs(
        taskId,
        true,
        slotsAvailable,
      );
      actions.push(...localOutputs);
    }

    // Fill cloud slots
    if (runningCounts.cloud < execution.maxCloudConcurrent) {
      const slotsAvailable = execution.maxCloudConcurrent - runningCounts.cloud;
      const cloudOutputs = await this.db.getNextOutputs(
        taskId,
        false,
        slotsAvailable,
      );
      actions.push(...cloudOutputs);
    }

    return actions;
  }

  /**
   * Process a single write/edit action
   */
  private async processWriteEditAction(
    taskId: string,
    context: ExecutionContext,
    output: OutputRow,
    config: TaskConfig,
  ): Promise<void> {
    const status = output.status;

    try {
      if (status === 'pending_write') {
        await this.processWrite(taskId, context, output, config);
      } else if (status === 'pending_edit') {
        await this.processEdit(taskId, context, output, config);
      } else if (status === 'pending_rewrite') {
        await this.processRewrite(taskId, context, output, config);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Action failed for output ${output.id}: ${errorMessage}`,
      );

      await this.db.updateOutputStatus(output.id, 'failed', {
        llm_metadata: { error: errorMessage },
      } as Partial<OutputRow>);

      await this.emitOutputUpdated(context, taskId, {
        ...output,
        status: 'failed',
      });
    }
  }

  /**
   * Process a write action
   */
  private async processWrite(
    taskId: string,
    context: ExecutionContext,
    output: OutputRow,
    _config: TaskConfig,
  ): Promise<void> {
    // Mark as in-progress
    await this.db.updateOutputStatus(output.id, 'writing');
    await this.emitOutputUpdated(context, taskId, {
      ...output,
      status: 'writing',
    });

    // Get writer personality (provider/model are now directly on the output row)
    const personality = await this.db.getAgentPersonality(
      output.writer_agent_slug,
    );

    if (!personality) {
      throw new Error('Writer personality not found');
    }

    // Get prompt data
    const taskData = await this.db.getPromptData(taskId);
    if (!taskData) {
      throw new Error('Task prompt data not found');
    }

    const contentTypeContext = await this.db.getContentTypeContext(
      taskData.contentTypeSlug as string,
    );

    // Build writer prompt
    const prompt = this.buildWriterPrompt(
      personality,
      taskData.promptData as Record<string, unknown>,
      contentTypeContext || '',
    );

    // Call LLM (provider/model are directly on the output row)
    const startTime = Date.now();
    const writerContext = {
      ...context,
      provider: output.writer_llm_provider,
      model: output.writer_llm_model,
    };

    const response = await this.llmClient.callLLM({
      context: writerContext,
      userMessage: prompt,
      callerName: `${AGENT_SLUG}:${output.writer_agent_slug}`,
    });

    const latencyMs = Date.now() - startTime;

    // Update output with content
    await this.db.updateOutputContent(
      output.id,
      response.text,
      'pending_edit',
      {
        tokensUsed: response.usage?.totalTokens,
        latencyMs,
        cost: response.usage?.cost,
      },
    );

    // Save version for edit history tracking
    await this.db.saveOutputVersion(
      output.id,
      taskId,
      response.text,
      'write',
      null,
      {
        tokensUsed: response.usage?.totalTokens,
        latencyMs,
        cost: response.usage?.cost,
      },
    );

    // Emit update with full data
    const updatedOutput = await this.db.getOutputById(output.id);
    if (updatedOutput) {
      await this.emitOutputUpdated(context, taskId, updatedOutput);
    }
  }

  /**
   * Process an edit action
   */
  private async processEdit(
    taskId: string,
    context: ExecutionContext,
    output: OutputRow,
    config: TaskConfig,
  ): Promise<void> {
    // Mark as in-progress
    await this.db.updateOutputStatus(output.id, 'editing');
    await this.emitOutputUpdated(context, taskId, {
      ...output,
      status: 'editing',
    });

    // IMPORTANT: Fetch fresh output with content - getNextOutputs doesn't return content
    const freshOutput = await this.db.getOutputById(output.id);
    if (!freshOutput) {
      throw new Error(`Output not found: ${output.id}`);
    }
    const content = freshOutput.content || '';

    // Get editor personality (provider/model are directly on the output row)
    const personality = await this.db.getAgentPersonality(
      output.editor_agent_slug!,
    );

    if (!personality) {
      throw new Error('Editor personality not found');
    }

    // Get prompt data for context
    const taskData = await this.db.getPromptData(taskId);

    // Build editor prompt
    const prompt = this.buildEditorPrompt(
      personality,
      content,
      taskData?.promptData as Record<string, unknown>,
    );

    // Call LLM (provider/model are directly on the output row)
    const startTime = Date.now();
    const editorContext = {
      ...context,
      provider: output.editor_llm_provider!,
      model: output.editor_llm_model!,
    };

    const response = await this.llmClient.callLLM({
      context: editorContext,
      userMessage: prompt,
      callerName: `${AGENT_SLUG}:${output.editor_agent_slug}`,
    });

    const latencyMs = Date.now() - startTime;

    // Parse editor response
    const { approved, feedback, revisedContent } = this.parseEditorResponse(
      response.text,
      content,
    );

    const newEditCycle = output.edit_cycle + 1;
    const maxCycles = config.execution.maxEditCycles;

    // Determine next status
    let nextStatus: string;
    if (approved) {
      nextStatus = 'approved';
    } else if (newEditCycle >= maxCycles) {
      // Hit max cycles without approval - content should NOT proceed to evaluation
      nextStatus = 'max_cycles_reached';
      this.logger.warn(
        `Output ${output.id} reached max edit cycles (${maxCycles}) without approval`,
      );
    } else {
      nextStatus = 'pending_rewrite';
    }

    // Update output
    await this.db.updateOutputAfterEdit(
      output.id,
      revisedContent,
      nextStatus,
      feedback,
      newEditCycle,
      {
        tokensUsed: response.usage?.totalTokens,
        latencyMs,
        cost: response.usage?.cost,
      },
    );

    // Emit update
    const updatedOutput = await this.db.getOutputById(output.id);
    if (updatedOutput) {
      await this.emitOutputUpdated(context, taskId, updatedOutput);
    }
  }

  /**
   * Process a rewrite action (writer revises based on editor feedback)
   */
  private async processRewrite(
    taskId: string,
    context: ExecutionContext,
    output: OutputRow,
    _config: TaskConfig,
  ): Promise<void> {
    // Mark as in-progress
    await this.db.updateOutputStatus(output.id, 'rewriting');
    await this.emitOutputUpdated(context, taskId, {
      ...output,
      status: 'rewriting',
    });

    // IMPORTANT: Fetch fresh output with content - getNextOutputs doesn't return content
    const freshOutput = await this.db.getOutputById(output.id);
    if (!freshOutput) {
      throw new Error(`Output not found: ${output.id}`);
    }
    const content = freshOutput.content || '';
    const editorFeedback = freshOutput.editor_feedback || '';

    // Get writer personality (provider/model are directly on the output row)
    const personality = await this.db.getAgentPersonality(
      output.writer_agent_slug,
    );

    if (!personality) {
      throw new Error('Writer personality not found');
    }

    // Build rewrite prompt
    const prompt = this.buildRewritePrompt(
      personality,
      content,
      editorFeedback,
    );

    // Call LLM (provider/model are directly on the output row)
    const startTime = Date.now();
    const writerContext = {
      ...context,
      provider: output.writer_llm_provider,
      model: output.writer_llm_model,
    };

    const response = await this.llmClient.callLLM({
      context: writerContext,
      userMessage: prompt,
      callerName: `${AGENT_SLUG}:${output.writer_agent_slug}:rewrite`,
    });

    const latencyMs = Date.now() - startTime;

    // Update output - goes back to pending_edit
    await this.db.updateOutputContent(
      output.id,
      response.text,
      'pending_edit',
      {
        tokensUsed: response.usage?.totalTokens,
        latencyMs,
        cost: response.usage?.cost,
      },
    );

    // Save version for edit history tracking (include editor feedback that triggered rewrite)
    await this.db.saveOutputVersion(
      output.id,
      taskId,
      response.text,
      'rewrite',
      editorFeedback,
      {
        tokensUsed: response.usage?.totalTokens,
        latencyMs,
        cost: response.usage?.cost,
      },
    );

    // Emit update
    const updatedOutput = await this.db.getOutputById(output.id);
    if (updatedOutput) {
      await this.emitOutputUpdated(context, taskId, updatedOutput);
    }
  }

  /**
   * Process evaluations (initial or final)
   */
  private async processEvaluations(
    taskId: string,
    context: ExecutionContext,
    config: TaskConfig,
    stage: 'initial' | 'final',
  ): Promise<void> {
    const execution = config.execution;
    let iterationCount = 0;
    const maxIterations = 1000;

    while (iterationCount < maxIterations) {
      iterationCount++;

      // Get pending evaluations
      const pending = await this.db.getPendingEvaluations(taskId, stage);

      if (pending.length === 0) {
        // Check if complete
        const allComplete =
          stage === 'initial'
            ? await this.db.areAllInitialEvaluationsComplete(taskId)
            : await this.db.areAllFinalEvaluationsComplete(taskId);

        if (allComplete) {
          break;
        }

        await this.sleep(1000);
        continue;
      }

      // Process evaluations in parallel (respecting cloud limits)
      const batch = pending.slice(0, execution.maxCloudConcurrent);
      await Promise.all(
        batch.map((evaluation) =>
          this.processEvaluation(taskId, context, evaluation, config, stage),
        ),
      );
    }
  }

  /**
   * Process a single evaluation
   */
  private async processEvaluation(
    taskId: string,
    context: ExecutionContext,
    evaluation: EvaluationRow,
    config: TaskConfig,
    stage: 'initial' | 'final',
  ): Promise<void> {
    try {
      // Get evaluator personality (provider/model are directly on the evaluation row)
      const personality = await this.db.getAgentPersonality(
        evaluation.evaluator_agent_slug,
      );

      if (!personality) {
        throw new Error('Evaluator personality not found');
      }

      // Get the output to evaluate
      const output = await this.db.getOutputById(evaluation.output_id);
      if (!output) {
        throw new Error('Output not found');
      }

      // Get prompt data
      const taskData = await this.db.getPromptData(taskId);

      // Build evaluation prompt
      const prompt =
        stage === 'initial'
          ? this.buildInitialEvaluationPrompt(
              personality,
              output.content || '',
              taskData?.promptData as Record<string, unknown>,
            )
          : this.buildFinalRankingPrompt(
              personality,
              output.content || '',
              taskData?.promptData as Record<string, unknown>,
            );

      // Call LLM (provider/model are directly on the evaluation row)
      const startTime = Date.now();
      const evalContext = {
        ...context,
        provider: evaluation.evaluator_llm_provider,
        model: evaluation.evaluator_llm_model,
      };

      const response = await this.llmClient.callLLM({
        context: evalContext,
        userMessage: prompt,
        callerName: `${AGENT_SLUG}:${evaluation.evaluator_agent_slug}:${stage}`,
      });

      const latencyMs = Date.now() - startTime;

      // Parse response
      const evalCost = response.usage?.cost ?? 0;
      const evalTokens = response.usage?.totalTokens ?? 0;

      if (stage === 'initial') {
        const { score, reasoning } = this.parseInitialEvaluationResponse(
          response.text,
        );

        await this.db.updateEvaluation(
          evaluation.id,
          score,
          reasoning,
          'completed',
          undefined,
          undefined,
          { tokensUsed: evalTokens, latencyMs, cost: evalCost },
        );
      } else {
        const { rank, reasoning } = this.parseFinalRankingResponse(
          response.text,
        );
        const weightedScore = this.rankToWeightedScore(rank);

        await this.db.updateEvaluation(
          evaluation.id,
          rank, // Use rank as the "score" for final stage
          reasoning,
          'completed',
          rank,
          weightedScore,
          { tokensUsed: evalTokens, latencyMs, cost: evalCost },
        );
      }

      // Add evaluation cost to the output's running total
      await this.db.addEvaluationCostToOutput(
        evaluation.output_id,
        evalCost,
        evalTokens,
      );

      // Emit output update with new cost (so frontend can show running total)
      const updatedOutput = await this.db.getOutputById(evaluation.output_id);
      if (updatedOutput) {
        await this.emitOutputUpdated(context, taskId, updatedOutput);
      }

      // Emit evaluation update
      await this.emitEvaluationUpdated(context, taskId, {
        ...evaluation,
        status: 'completed',
      });

      // Emit ranking update
      await this.emitRankingUpdated(context, taskId, stage);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Evaluation failed for ${evaluation.id}: ${errorMessage}`,
      );

      // Use null for score on failure (constraint requires 1-10, so 0 would fail)
      await this.db.updateEvaluation(
        evaluation.id,
        null,
        errorMessage,
        'failed',
      );
    }
  }

  // ========================================
  // PROMPT BUILDERS
  // ========================================

  private buildWriterPrompt(
    personality: AgentPersonality,
    promptData: Record<string, unknown>,
    contentTypeContext: string,
  ): string {
    const personalityContext =
      (personality.personality as Record<string, string>).system_context || '';

    return `${personalityContext}

${contentTypeContext}

## Content Brief

**Topic**: ${String((promptData.topic as string | number | boolean | null | undefined) ?? '')}
**Target Audience**: ${String((promptData.audience as string | number | boolean | null | undefined) ?? '')}
**Goal**: ${String((promptData.goal as string | number | boolean | null | undefined) ?? '')}
**Tone**: ${String((promptData.tone as string | number | boolean | null | undefined) ?? '')}

**Key Points to Cover**:
${((promptData.keyPoints as string[]) || []).map((p, i) => `${i + 1}. ${p}`).join('\n')}

${promptData.constraints ? `**Constraints**: ${String(promptData.constraints as string | number | boolean)}` : ''}
${promptData.examples ? `**Style Examples**: ${String(promptData.examples as string | number | boolean)}` : ''}
${promptData.additionalContext ? `**Additional Context**: ${String(promptData.additionalContext as string | number | boolean)}` : ''}

Please write the content based on this brief.`;
  }

  private buildEditorPrompt(
    personality: AgentPersonality,
    content: string,
    promptData: Record<string, unknown>,
  ): string {
    const personalityContext =
      (personality.personality as Record<string, string>).system_context || '';
    const reviewFocus =
      (personality.personality as Record<string, string[]>).review_focus || [];
    const approvalCriteria =
      (personality.personality as Record<string, string>).approval_criteria ||
      '';

    return `${personalityContext}

## Your Review Focus
${reviewFocus.map((f) => `- ${f}`).join('\n')}

## Approval Criteria
${approvalCriteria}

## Content to Review

${content}

## Original Brief

**Topic**: ${String((promptData.topic as string | number | boolean | null | undefined) ?? '')}
**Target Audience**: ${String((promptData.audience as string | number | boolean | null | undefined) ?? '')}
**Goal**: ${String((promptData.goal as string | number | boolean | null | undefined) ?? '')}
**Tone**: ${String((promptData.tone as string | number | boolean | null | undefined) ?? '')}

## Your Task

1. Review the content against the brief and your editorial focus
2. Provide specific, actionable feedback
3. Decide whether to APPROVE or REQUEST CHANGES

Format your response as:
**Decision**: APPROVE or REQUEST_CHANGES
**Feedback**: Your detailed feedback
**Revised Content** (if requesting changes): The improved version`;
  }

  private buildRewritePrompt(
    personality: AgentPersonality,
    currentContent: string,
    editorFeedback: string,
  ): string {
    const personalityContext =
      (personality.personality as Record<string, string>).system_context || '';

    return `${personalityContext}

## Your Previous Draft

${currentContent}

## Editor Feedback

${editorFeedback}

## Your Task

Please revise the content based on the editor's feedback while maintaining your unique voice and style.
Address all the points raised by the editor.

Write the complete revised content:`;
  }

  private buildInitialEvaluationPrompt(
    personality: AgentPersonality,
    content: string,
    promptData: Record<string, unknown>,
  ): string {
    const personalityContext =
      (personality.personality as Record<string, string>).system_context || '';
    const evaluationCriteria =
      personality.personality.evaluation_criteria || {};
    const scoreAnchors = personality.personality.score_anchors || {};

    return `${personalityContext}

## Evaluation Criteria
${Object.entries(evaluationCriteria)
  .map(([key, value]) => `- **${key}**: ${value}`)
  .join('\n')}

## Score Anchors
${Object.entries(scoreAnchors)
  .map(([range, desc]) => `- ${range}: ${desc}`)
  .join('\n')}

## Content to Evaluate

${content}

## Original Brief

**Topic**: ${String((promptData.topic as string | number | boolean | null | undefined) ?? '')}
**Target Audience**: ${String((promptData.audience as string | number | boolean | null | undefined) ?? '')}
**Goal**: ${String((promptData.goal as string | number | boolean | null | undefined) ?? '')}

## Your Task

Score this content from 1-10 based on your evaluation criteria.
Provide detailed reasoning for your score.

Format your response as:
**Score**: [1-10]
**Reasoning**: Your detailed evaluation`;
  }

  private buildFinalRankingPrompt(
    personality: AgentPersonality,
    content: string,
    promptData: Record<string, unknown>,
  ): string {
    const personalityContext =
      (personality.personality as Record<string, string>).system_context || '';

    return `${personalityContext}

## FINAL RANKING ROUND

You are now in the final ranking round. This content is one of the top finalists.
You must assign it a rank from 1-5 (1 being the best).

**Important**: This is a forced ranking. You cannot give multiple documents the same rank.
Rank 1 = 100 points, Rank 2 = 60 points, Rank 3 = 30 points, Rank 4 = 10 points, Rank 5 = 5 points

## Content to Rank

${content}

## Original Brief

**Topic**: ${String((promptData.topic as string | number | boolean | null | undefined) ?? '')}
**Target Audience**: ${String((promptData.audience as string | number | boolean | null | undefined) ?? '')}
**Goal**: ${String((promptData.goal as string | number | boolean | null | undefined) ?? '')}

## Your Task

Assign this content a rank from 1-5.
Explain why you ranked it this way.

Format your response as:
**Rank**: [1-5]
**Reasoning**: Why this rank`;
  }

  // ========================================
  // RESPONSE PARSERS
  // ========================================

  private parseEditorResponse(
    response: string,
    originalContent: string,
  ): { approved: boolean; feedback: string; revisedContent: string } {
    const approved =
      response.toUpperCase().includes('APPROVE') &&
      !response.toUpperCase().includes('REQUEST_CHANGES');

    const feedbackMatch = response.match(
      /\*\*Feedback\*\*:\s*([\s\S]*?)(?=\*\*Revised Content\*\*|$)/i,
    );
    const revisedMatch = response.match(
      /\*\*Revised Content\*\*:\s*([\s\S]*?)$/i,
    );

    return {
      approved,
      feedback: feedbackMatch ? feedbackMatch[1]!.trim() : response,
      revisedContent: revisedMatch ? revisedMatch[1]!.trim() : originalContent,
    };
  }

  private parseInitialEvaluationResponse(response: string): {
    score: number;
    reasoning: string;
  } {
    const scoreMatch = response.match(/\*\*Score\*\*:\s*(\d+)/i);
    const reasoningMatch = response.match(/\*\*Reasoning\*\*:\s*([\s\S]*?)$/i);

    return {
      score: scoreMatch
        ? Math.min(10, Math.max(1, parseInt(scoreMatch[1]!, 10)))
        : 5,
      reasoning: reasoningMatch ? reasoningMatch[1]!.trim() : response,
    };
  }

  private parseFinalRankingResponse(response: string): {
    rank: number;
    reasoning: string;
  } {
    const rankMatch = response.match(/\*\*Rank\*\*:\s*(\d+)/i);
    const reasoningMatch = response.match(/\*\*Reasoning\*\*:\s*([\s\S]*?)$/i);

    return {
      rank: rankMatch
        ? Math.min(5, Math.max(1, parseInt(rankMatch[1]!, 10)))
        : 5,
      reasoning: reasoningMatch ? reasoningMatch[1]!.trim() : response,
    };
  }

  private rankToWeightedScore(rank: number): number {
    switch (rank) {
      case 1:
        return 100;
      case 2:
        return 60;
      case 3:
        return 30;
      case 4:
        return 10;
      case 5:
        return 5;
      default:
        return 0;
    }
  }

  // ========================================
  // SSE EMITTERS (Fat Messages)
  // ========================================

  private async emitPhaseChange(
    context: ExecutionContext,
    taskId: string,
    phase: SwarmPhase,
  ): Promise<void> {
    await this.observability.emitProgress(context, taskId, `Phase: ${phase}`, {
      metadata: {
        type: 'phase_changed',
        phase,
      },
    });
  }

  private async emitQueueBuilt(
    context: ExecutionContext,
    taskId: string,
    outputs: OutputRow[],
    config: TaskConfig,
  ): Promise<void> {
    await this.observability.emitProgress(
      context,
      taskId,
      `Queue built: ${outputs.length} output combinations`,
      {
        metadata: {
          type: 'queue_built',
          taskId,
          totalOutputs: outputs.length,
          writers: config.writers.length,
          editors: config.editors.length,
          evaluators: config.evaluators.length,
          outputs: outputs.map((o) => ({
            id: o.id,
            status: o.status,
            writerAgentSlug: o.writer_agent_slug,
            editorAgentSlug: o.editor_agent_slug,
          })),
        },
      },
    );
  }

  private async emitOutputUpdated(
    context: ExecutionContext,
    taskId: string,
    output: OutputRow,
  ): Promise<void> {
    // Get full agent details for fat message
    const writerPersonality = await this.db.getAgentPersonality(
      output.writer_agent_slug,
    );
    const editorPersonality = output.editor_agent_slug
      ? await this.db.getAgentPersonality(output.editor_agent_slug)
      : null;

    await this.observability.emitProgress(
      context,
      taskId,
      `Output ${output.id} status: ${output.status}`,
      {
        metadata: {
          type: 'output_updated',
          taskId,
          output: {
            id: output.id,
            status: output.status,
            writerAgent: {
              slug: output.writer_agent_slug,
              name: writerPersonality?.name,
              llmProvider: output.writer_llm_provider,
              llmModel: output.writer_llm_model,
              isLocal: output.writer_llm_provider === 'ollama',
            },
            editorAgent: output.editor_agent_slug
              ? {
                  slug: output.editor_agent_slug,
                  name: editorPersonality?.name,
                  llmProvider: output.editor_llm_provider,
                  llmModel: output.editor_llm_model,
                  isLocal: output.editor_llm_provider === 'ollama',
                }
              : null,
            content: output.content,
            editCycle: output.edit_cycle,
            editorFeedback: output.editor_feedback,
            initialAvgScore: output.initial_avg_score,
            initialRank: output.initial_rank,
            isFinalist: output.is_finalist,
            finalTotalScore: output.final_total_score,
            finalRank: output.final_rank,
            llmMetadata: output.llm_metadata,
            createdAt: output.created_at,
            updatedAt: output.updated_at,
          },
        },
      },
    );
  }

  private async emitEvaluationUpdated(
    context: ExecutionContext,
    taskId: string,
    evaluation: EvaluationRow,
  ): Promise<void> {
    const evaluatorPersonality = await this.db.getAgentPersonality(
      evaluation.evaluator_agent_slug,
    );

    await this.observability.emitProgress(
      context,
      taskId,
      `Evaluation ${evaluation.id} completed`,
      {
        metadata: {
          type: 'evaluation_updated',
          taskId,
          evaluation: {
            id: evaluation.id,
            outputId: evaluation.output_id,
            stage: evaluation.stage,
            status: evaluation.status,
            evaluatorAgent: {
              slug: evaluation.evaluator_agent_slug,
              name: evaluatorPersonality?.name,
              llmProvider: evaluation.evaluator_llm_provider,
              llmModel: evaluation.evaluator_llm_model,
              isLocal: evaluation.evaluator_llm_provider === 'ollama',
            },
            score: evaluation.score,
            rank: evaluation.rank,
            weightedScore: evaluation.weighted_score,
            reasoning: evaluation.reasoning,
            llmMetadata: evaluation.llm_metadata,
          },
        },
      },
    );
  }

  private async emitFinalistsSelected(
    context: ExecutionContext,
    taskId: string,
    count: number,
  ): Promise<void> {
    // Get finalist outputs
    const allOutputs = await this.db.getAllOutputs(taskId);
    const finalists = allOutputs
      .filter((o) => o.is_finalist)
      .sort((a, b) => (a.initial_rank || 999) - (b.initial_rank || 999));

    await this.observability.emitProgress(
      context,
      taskId,
      `Selected ${count} finalists`,
      {
        metadata: {
          type: 'finalists_selected',
          taskId,
          count,
          finalists: finalists.map((f) => ({
            id: f.id,
            rank: f.initial_rank,
            avgScore: f.initial_avg_score,
            writerAgentSlug: f.writer_agent_slug,
            editorAgentSlug: f.editor_agent_slug,
          })),
        },
      },
    );
  }

  private async emitRankingUpdated(
    context: ExecutionContext,
    taskId: string,
    stage: 'initial' | 'final',
  ): Promise<void> {
    const allOutputs = await this.db.getAllOutputs(taskId);
    const allEvaluations = await this.db.getAllEvaluations(taskId);

    // Calculate current rankings
    const rankings = allOutputs
      .filter((o) => (stage === 'final' ? o.is_finalist : true))
      .map((output) => {
        const evals = allEvaluations.filter(
          (e) =>
            e.output_id === output.id &&
            e.stage === stage &&
            e.status === 'completed',
        );

        if (stage === 'initial') {
          const totalScore = evals.reduce((sum, e) => sum + (e.score || 0), 0);
          const avgScore = evals.length > 0 ? totalScore / evals.length : 0;
          return {
            outputId: output.id,
            totalScore,
            avgScore: Math.round(avgScore * 10) / 10,
            writerAgentSlug: output.writer_agent_slug,
            editorAgentSlug: output.editor_agent_slug,
          };
        } else {
          const totalScore = evals.reduce(
            (sum, e) => sum + (e.weighted_score || 0),
            0,
          );
          return {
            outputId: output.id,
            totalScore,
            avgScore: output.initial_avg_score,
            writerAgentSlug: output.writer_agent_slug,
            editorAgentSlug: output.editor_agent_slug,
          };
        }
      })
      .sort((a, b) => b.totalScore - a.totalScore)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    await this.observability.emitProgress(
      context,
      taskId,
      `Ranking updated (${stage})`,
      {
        metadata: {
          type: 'ranking_updated',
          taskId,
          stage,
          rankings,
        },
      },
    );
  }

  // ========================================
  // UTILITIES
  // ========================================

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
