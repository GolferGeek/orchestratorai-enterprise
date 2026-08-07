import { Injectable, Logger } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import {
  MarketingDbService,
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

      if (finalistCount < 1) {
        throw new Error('Marketing Swarm selected no finalists');
      }
      await this.emitPhaseChange(context, taskId, 'evaluating_final');
      await this.db.buildFinalEvaluations(taskId, config);
      await this.processEvaluations(taskId, context, config, 'final');

      // Phase 6: Calculate final rankings
      await this.emitPhaseChange(context, taskId, 'ranking');
      await this.db.calculateFinalRankings(taskId);

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
   * Process the writing and editing phase using a continuously-refilling
   * worker pool.
   *
   * Each output flows write -> edit (-> rewrite) as an independent chain. The
   * pool keeps up to maxCloudConcurrent cloud slots and maxLocalConcurrent
   * local slots saturated at all times: the instant one action finishes and
   * frees a slot, the next eligible action is dispatched — including an output's
   * edit the moment its own write lands. There is NO barrier between the write
   * and edit phases, and no per-batch join, so a single slow edit can never
   * idle the other slots (the previous implementation awaited a whole batch
   * before refilling, which starved the pool and made edits appear to stall
   * behind the last-finishing write).
   */
  private async processWritingAndEditing(
    taskId: string,
    context: ExecutionContext,
    config: TaskConfig,
  ): Promise<void> {
    const execution = config.execution;

    // In-flight actions keyed by output id. A dispatched row keeps its
    // pending_* status in the DB until processWrite/processEdit flips it, so we
    // track dispatches here to avoid re-selecting the same row before it
    // transitions (in-memory counts are the source of truth for slot accounting).
    const inFlight = new Map<
      string,
      { promise: Promise<void>; isLocal: boolean }
    >();

    // The DB classifies a row as local iff its writer runs on ollama; mirror
    // that here so per-track slot accounting matches get_next_outputs.
    const isLocalRow = (row: OutputRow): boolean =>
      row.writer_llm_provider === 'ollama';

    const dispatch = (row: OutputRow): void => {
      const local = isLocalRow(row);
      // processWriteEditAction never rejects (it records failures on the row),
      // so the chained promise always settles and frees its slot.
      const promise = this.processWriteEditAction(
        taskId,
        context,
        row,
        config,
      ).finally(() => {
        inFlight.delete(row.id);
      });
      inFlight.set(row.id, { promise, isLocal: local });
    };

    const maxIterations = 100000; // Safety backstop against a stuck row
    let iterationCount = 0;

    while (iterationCount < maxIterations) {
      iterationCount++;

      // Open slots per track, from in-memory in-flight counts.
      let localInFlight = 0;
      let cloudInFlight = 0;
      for (const entry of inFlight.values()) {
        if (entry.isLocal) localInFlight++;
        else cloudInFlight++;
      }
      const cloudSlots = Math.max(
        0,
        execution.maxCloudConcurrent - cloudInFlight,
      );
      const localSlots = Math.max(
        0,
        execution.maxLocalConcurrent - localInFlight,
      );

      let dispatched = 0;

      // Fill cloud slots. Over-fetch by the in-flight count so that rows still
      // showing pending_* (dispatched but not yet transitioned) can be filtered
      // out without starving the fetch.
      if (cloudSlots > 0) {
        const rows = await this.db.getNextOutputs(
          taskId,
          false,
          cloudSlots + inFlight.size,
        );
        const fresh = rows
          .filter((r) => !inFlight.has(r.id))
          .slice(0, cloudSlots);
        for (const r of fresh) dispatch(r);
        dispatched += fresh.length;
      }

      // Fill local slots (ollama track).
      if (localSlots > 0) {
        const rows = await this.db.getNextOutputs(
          taskId,
          true,
          localSlots + inFlight.size,
        );
        const fresh = rows
          .filter((r) => !inFlight.has(r.id))
          .slice(0, localSlots);
        for (const r of fresh) dispatch(r);
        dispatched += fresh.length;
      }

      if (dispatched > 0) {
        // Loop immediately to keep filling any remaining slots without blocking.
        continue;
      }

      // Nothing new to dispatch this pass.
      if (inFlight.size === 0) {
        // No work running and none queued — either finished or transitioning.
        if (await this.db.areAllOutputsComplete(taskId)) {
          break;
        }
        // Rare: rows momentarily between states with nothing in flight.
        await this.sleep(500);
        continue;
      }

      // Slots are full (or the only eligible rows are already in flight). Wait
      // for the next action to finish, freeing a slot, then refill.
      await Promise.race(
        Array.from(inFlight.values(), (entry) => entry.promise),
      );
    }

    if (!(await this.db.areAllOutputsComplete(taskId))) {
      throw new Error(
        'Marketing Swarm writing loop exceeded its iteration limit',
      );
    }
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
    if (!contentTypeContext) {
      throw new Error(
        `Content type context not found: ${taskData.contentTypeSlug}`,
      );
    }

    // Build writer prompt
    const prompt = this.buildWriterPrompt(
      personality,
      taskData.promptData as Record<string, unknown>,
      contentTypeContext,
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
    const usage = this.requireUsage(response.usage);

    const latencyMs = Date.now() - startTime;

    // Update output with content
    await this.db.updateOutputContent(
      output.id,
      response.text,
      'pending_edit',
      {
        tokensUsed: usage.totalTokens,
        latencyMs,
        cost: usage.cost,
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
        tokensUsed: usage.totalTokens,
        latencyMs,
        cost: usage.cost,
      },
    );

    // Emit update with full data
    const updatedOutput = await this.db.getOutputById(output.id);
    if (!updatedOutput) {
      throw new Error(`Updated output not found: ${output.id}`);
    }
    await this.emitOutputUpdated(context, taskId, updatedOutput);
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
    const content = this.requireContent(freshOutput.content, output.id);

    if (
      !output.editor_agent_slug ||
      !output.editor_llm_provider ||
      !output.editor_llm_model
    ) {
      throw new Error(`Output ${output.id} has incomplete editor routing`);
    }

    // Get editor personality (provider/model are directly on the output row)
    const personality = await this.db.getAgentPersonality(
      output.editor_agent_slug,
    );

    if (!personality) {
      throw new Error('Editor personality not found');
    }

    // Get prompt data for context
    const taskData = await this.db.getPromptData(taskId);
    if (!taskData) {
      throw new Error('Task prompt data not found');
    }

    // Build editor prompt
    const prompt = this.buildEditorPrompt(
      personality,
      content,
      taskData.promptData as Record<string, unknown>,
    );

    // Call LLM (provider/model are directly on the output row)
    const startTime = Date.now();
    const editorContext = {
      ...context,
      provider: output.editor_llm_provider,
      model: output.editor_llm_model,
    };

    const response = await this.llmClient.callLLM({
      context: editorContext,
      userMessage: prompt,
      callerName: `${AGENT_SLUG}:${output.editor_agent_slug}`,
    });
    const usage = this.requireUsage(response.usage);

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
        tokensUsed: usage.totalTokens,
        latencyMs,
        cost: usage.cost,
      },
    );

    // Emit update
    const updatedOutput = await this.db.getOutputById(output.id);
    if (!updatedOutput) {
      throw new Error(`Updated output not found: ${output.id}`);
    }
    await this.emitOutputUpdated(context, taskId, updatedOutput);
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
    const content = this.requireContent(freshOutput.content, output.id);
    const editorFeedback = this.requireContent(
      freshOutput.editor_feedback,
      `${output.id} editor feedback`,
    );

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
    const usage = this.requireUsage(response.usage);

    const latencyMs = Date.now() - startTime;

    // Update output - goes back to pending_edit
    await this.db.updateOutputContent(
      output.id,
      response.text,
      'pending_edit',
      {
        tokensUsed: usage.totalTokens,
        latencyMs,
        cost: usage.cost,
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
        tokensUsed: usage.totalTokens,
        latencyMs,
        cost: usage.cost,
      },
    );

    // Emit update
    const updatedOutput = await this.db.getOutputById(output.id);
    if (!updatedOutput) {
      throw new Error(`Updated output not found: ${output.id}`);
    }
    await this.emitOutputUpdated(context, taskId, updatedOutput);
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

    const allComplete =
      stage === 'initial'
        ? await this.db.areAllInitialEvaluationsComplete(taskId)
        : await this.db.areAllFinalEvaluationsComplete(taskId);
    if (!allComplete) {
      throw new Error(
        `Marketing Swarm ${stage} evaluation loop exceeded its iteration limit`,
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
      if (!taskData) {
        throw new Error('Task prompt data not found');
      }
      const outputContent = this.requireContent(
        output.content,
        evaluation.output_id,
      );

      // Build evaluation prompt
      const prompt =
        stage === 'initial'
          ? this.buildInitialEvaluationPrompt(
              personality,
              outputContent,
              taskData.promptData as Record<string, unknown>,
            )
          : this.buildFinalRankingPrompt(
              personality,
              outputContent,
              taskData.promptData as Record<string, unknown>,
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
      const usage = this.requireUsage(response.usage);
      const evalCost = usage.cost;
      const evalTokens = usage.totalTokens;

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
      if (!updatedOutput) {
        throw new Error(`Updated output not found: ${evaluation.output_id}`);
      }
      await this.emitOutputUpdated(context, taskId, updatedOutput);

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
    const personalityContext = this.requirePersonalityString(
      personality,
      'system_context',
    );
    const topic = this.requirePromptString(promptData, 'topic');
    const audience = this.requirePromptString(promptData, 'audience');
    const goal = this.requirePromptString(promptData, 'goal');
    const tone = this.requirePromptString(promptData, 'tone');
    const keyPoints = this.requirePromptStringArray(promptData, 'keyPoints');

    return `${personalityContext}

${contentTypeContext}

## Content Brief

**Topic**: ${topic}
**Target Audience**: ${audience}
**Goal**: ${goal}
**Tone**: ${tone}

**Key Points to Cover**:
${keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

${this.optionalPromptLine(promptData, 'constraints', 'Constraints')}
${this.optionalPromptLine(promptData, 'examples', 'Style Examples')}
${this.optionalPromptLine(promptData, 'additionalContext', 'Additional Context')}

Please write the content based on this brief.`;
  }

  private buildEditorPrompt(
    personality: AgentPersonality,
    content: string,
    promptData: Record<string, unknown>,
  ): string {
    const personalityContext = this.requirePersonalityString(
      personality,
      'system_context',
    );
    const reviewFocus = this.requirePersonalityStringArray(
      personality,
      'review_focus',
    );
    const approvalCriteria = this.requirePersonalityString(
      personality,
      'approval_criteria',
    );
    const topic = this.requirePromptString(promptData, 'topic');
    const audience = this.requirePromptString(promptData, 'audience');
    const goal = this.requirePromptString(promptData, 'goal');
    const tone = this.requirePromptString(promptData, 'tone');

    return `${personalityContext}

## Your Review Focus
${reviewFocus.map((f) => `- ${f}`).join('\n')}

## Approval Criteria
${approvalCriteria}

## Content to Review

${content}

## Original Brief

**Topic**: ${topic}
**Target Audience**: ${audience}
**Goal**: ${goal}
**Tone**: ${tone}

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
    const personalityContext = this.requirePersonalityString(
      personality,
      'system_context',
    );

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
    const personalityContext = this.requirePersonalityString(
      personality,
      'system_context',
    );
    const evaluationCriteria = this.requirePersonalityStringRecord(
      personality,
      'evaluation_criteria',
    );
    const scoreAnchors = this.requirePersonalityStringRecord(
      personality,
      'score_anchors',
    );
    const topic = this.requirePromptString(promptData, 'topic');
    const audience = this.requirePromptString(promptData, 'audience');
    const goal = this.requirePromptString(promptData, 'goal');

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

**Topic**: ${topic}
**Target Audience**: ${audience}
**Goal**: ${goal}

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
    const personalityContext = this.requirePersonalityString(
      personality,
      'system_context',
    );
    const topic = this.requirePromptString(promptData, 'topic');
    const audience = this.requirePromptString(promptData, 'audience');
    const goal = this.requirePromptString(promptData, 'goal');

    return `${personalityContext}

## FINAL RANKING ROUND

You are now in the final ranking round. This content is one of the top finalists.
You must assign it a rank from 1-5 (1 being the best).

**Important**: This is a forced ranking. You cannot give multiple documents the same rank.
Rank 1 = 100 points, Rank 2 = 60 points, Rank 3 = 30 points, Rank 4 = 10 points, Rank 5 = 5 points

## Content to Rank

${content}

## Original Brief

**Topic**: ${topic}
**Target Audience**: ${audience}
**Goal**: ${goal}

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
    const decisionMatch = response.match(
      /\*\*Decision\*\*:\s*(APPROVE|REQUEST_CHANGES)/i,
    );
    if (!decisionMatch) {
      throw new Error('Editor response is missing a valid Decision');
    }
    const approved = decisionMatch[1]!.toUpperCase() === 'APPROVE';

    const feedbackMatch = response.match(
      /\*\*Feedback\*\*:\s*([\s\S]*?)(?=\*\*Revised Content\*\*|$)/i,
    );
    const revisedMatch = response.match(
      /\*\*Revised Content\*\*:\s*([\s\S]*?)$/i,
    );

    const feedback = feedbackMatch?.[1]?.trim();
    if (!feedback) {
      throw new Error('Editor response is missing Feedback');
    }
    const revisedContent = approved
      ? originalContent
      : revisedMatch?.[1]?.trim();
    if (!revisedContent) {
      throw new Error('Editor response is missing Revised Content');
    }
    return { approved, feedback, revisedContent };
  }

  private parseInitialEvaluationResponse(response: string): {
    score: number;
    reasoning: string;
  } {
    const scoreMatch = response.match(/\*\*Score\*\*:\s*(\d+)/i);
    const reasoningMatch = response.match(/\*\*Reasoning\*\*:\s*([\s\S]*?)$/i);

    const score = scoreMatch ? Number(scoreMatch[1]) : Number.NaN;
    const reasoning = reasoningMatch?.[1]?.trim();
    if (!Number.isInteger(score) || score < 1 || score > 10 || !reasoning) {
      throw new Error('Initial evaluation response is malformed');
    }
    return { score, reasoning };
  }

  private parseFinalRankingResponse(response: string): {
    rank: number;
    reasoning: string;
  } {
    const rankMatch = response.match(/\*\*Rank\*\*:\s*(\d+)/i);
    const reasoningMatch = response.match(/\*\*Reasoning\*\*:\s*([\s\S]*?)$/i);

    const rank = rankMatch ? Number(rankMatch[1]) : Number.NaN;
    const reasoning = reasoningMatch?.[1]?.trim();
    if (!Number.isInteger(rank) || rank < 1 || rank > 5 || !reasoning) {
      throw new Error('Final ranking response is malformed');
    }
    return { rank, reasoning };
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
        throw new Error(`Unsupported final rank: ${rank}`);
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
    if (!writerPersonality) {
      throw new Error(
        `Writer personality not found: ${output.writer_agent_slug}`,
      );
    }
    const editorPersonality = output.editor_agent_slug
      ? await this.db.getAgentPersonality(output.editor_agent_slug)
      : null;
    if (output.editor_agent_slug && !editorPersonality) {
      throw new Error(
        `Editor personality not found: ${output.editor_agent_slug}`,
      );
    }

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
              name: writerPersonality.name,
              llmProvider: output.writer_llm_provider,
              llmModel: output.writer_llm_model,
              isLocal: output.writer_llm_provider === 'ollama',
            },
            editorAgent: output.editor_agent_slug
              ? {
                  slug: output.editor_agent_slug,
                  name: this.requirePersonalityName(
                    editorPersonality,
                    output.editor_agent_slug,
                  ),
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
    if (!evaluatorPersonality) {
      throw new Error(
        `Evaluator personality not found: ${evaluation.evaluator_agent_slug}`,
      );
    }

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
              name: evaluatorPersonality.name,
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
      .sort((a, b) => this.requireInitialRank(a) - this.requireInitialRank(b));
    if (finalists.length !== count) {
      throw new Error(
        `Finalist count mismatch: expected ${count}, found ${finalists.length}`,
      );
    }

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
          if (evals.length === 0) {
            throw new Error(
              `Output ${output.id} has no completed initial evaluations`,
            );
          }
          const totalScore = evals.reduce(
            (sum, evaluation) =>
              sum +
              this.requireEvaluationMetric(evaluation.score, evaluation.id),
            0,
          );
          const avgScore = totalScore / evals.length;
          return {
            outputId: output.id,
            totalScore,
            avgScore: Math.round(avgScore * 10) / 10,
            writerAgentSlug: output.writer_agent_slug,
            editorAgentSlug: output.editor_agent_slug,
          };
        } else {
          const totalScore = evals.reduce(
            (sum, evaluation) =>
              sum +
              this.requireEvaluationMetric(
                evaluation.weighted_score,
                evaluation.id,
              ),
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

  private requireContent(value: string | null, label: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`Required content is missing: ${label}`);
    }
    return value;
  }

  private requireUsage(
    usage:
      | {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
          cost?: number;
        }
      | undefined,
  ): { totalTokens: number; cost: number } {
    if (
      !usage ||
      !Number.isInteger(usage.totalTokens) ||
      usage.totalTokens < 0 ||
      typeof usage.cost !== 'number' ||
      !Number.isFinite(usage.cost) ||
      usage.cost < 0
    ) {
      throw new Error('LLM response is missing valid token and cost usage');
    }
    return { totalTokens: usage.totalTokens, cost: usage.cost };
  }

  private requirePersonalityString(
    personality: AgentPersonality,
    key: string,
  ): string {
    const value = personality.personality[key];
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(
        `Agent ${personality.slug} is missing personality.${key}`,
      );
    }
    return value;
  }

  private requirePersonalityStringArray(
    personality: AgentPersonality,
    key: string,
  ): string[] {
    const value = personality.personality[key];
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      !value.every((item) => typeof item === 'string' && item.trim())
    ) {
      throw new Error(
        `Agent ${personality.slug} has invalid personality.${key}`,
      );
    }
    return value;
  }

  private requirePersonalityStringRecord(
    personality: AgentPersonality,
    key: string,
  ): Record<string, string> {
    const value = personality.personality[key];
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      Object.keys(value).length === 0 ||
      !Object.values(value).every(
        (item) => typeof item === 'string' && item.trim(),
      )
    ) {
      throw new Error(
        `Agent ${personality.slug} has invalid personality.${key}`,
      );
    }
    return value as Record<string, string>;
  }

  private requirePersonalityName(
    personality: AgentPersonality | null,
    slug: string,
  ): string {
    if (!personality) {
      throw new Error(`Agent personality not found: ${slug}`);
    }
    return personality.name;
  }

  private requirePromptString(
    promptData: Record<string, unknown>,
    key: string,
  ): string {
    const value = promptData[key];
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`Marketing brief is missing ${key}`);
    }
    return value;
  }

  private requirePromptStringArray(
    promptData: Record<string, unknown>,
    key: string,
  ): string[] {
    const value = promptData[key];
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      !value.every((item) => typeof item === 'string' && item.trim())
    ) {
      throw new Error(`Marketing brief has invalid ${key}`);
    }
    return value;
  }

  private optionalPromptLine(
    promptData: Record<string, unknown>,
    key: string,
    label: string,
  ): string {
    const value = promptData[key];
    if (value === undefined) {
      return '';
    }
    if (typeof value !== 'string') {
      throw new Error(`Marketing brief has invalid ${key}`);
    }
    return value ? `**${label}**: ${value}` : '';
  }

  private requireInitialRank(output: OutputRow): number {
    if (!Number.isInteger(output.initial_rank) || output.initial_rank! < 1) {
      throw new Error(`Finalist ${output.id} has no initial rank`);
    }
    return output.initial_rank!;
  }

  private requireEvaluationMetric(
    value: number | null,
    evaluationId: string,
  ): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Evaluation ${evaluationId} has no score`);
    }
    return value;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
