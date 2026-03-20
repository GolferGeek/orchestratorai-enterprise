import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
} from '@orchestrator-ai/transport-types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Execution configuration from task.config.execution
 */
export interface ExecutionConfig {
  maxLocalConcurrent: number;
  maxCloudConcurrent: number;
  maxEditCycles: number;
  topNForFinalRanking: number;
  topNForDeliverable: number;
}

/**
 * Output version row from marketing.output_versions
 */
export interface OutputVersionRow {
  id: string;
  output_id: string;
  task_id: string;
  version_number: number;
  content: string;
  action_type: 'write' | 'rewrite';
  editor_feedback: string | null;
  llm_metadata: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Deliverable output with full edit history
 */
export interface DeliverableOutput {
  rank: number;
  outputId: string;
  writerAgentSlug: string;
  editorAgentSlug: string | null;
  finalContent: string;
  initialScore: number | null;
  finalScore: number | null;
  editHistory: {
    version: number;
    content: string;
    actionType: 'write' | 'rewrite';
    editorFeedback: string | null;
    createdAt: string;
  }[];
  evaluations: {
    stage: 'initial' | 'final';
    evaluatorSlug: string;
    score: number | null;
    rank: number | null;
    reasoning: string | null;
  }[];
}

/**
 * Complete deliverable structure
 */
export interface Deliverable {
  taskId: string;
  contentTypeSlug: string;
  promptData: Record<string, unknown>;
  totalOutputs: number;
  deliveredCount: number;
  rankedOutputs: DeliverableOutput[];
  generatedAt: string;
}

/**
 * Version format for API runner compatibility
 *
 * Versions are returned in reverse rank order so the BEST content is the latest version:
 * - Version 1 = lowest ranked (e.g., 5th best)
 * - Version N = highest ranked (1st place winner)
 *
 * This matches typical versioning semantics where "latest is best"
 */
export interface DeliverableVersion {
  version: number; // 1, 2, 3... (ascending, latest = best)
  rank: number; // Original rank from evaluation (1 = best)
  content: string; // The final content
  writerAgent: string; // Writer agent slug
  editorAgent: string | null; // Editor agent slug
  score: number | null; // Final evaluation score
  metadata: {
    outputId: string;
    editCycles: number;
    initialScore: number | null;
    finalScore: number | null;
    writerLlmProvider: string;
    writerLlmModel: string;
    editorLlmProvider: string | null;
    editorLlmModel: string | null;
  };
}

/**
 * Versioned deliverable for API runner
 * The versions array contains ranked outputs in reverse order (best = last)
 *
 * The `type: 'versioned'` field signals the API runner to create
 * multiple deliverable versions from the versions array.
 */
export interface VersionedDeliverable {
  type: 'versioned'; // Signals API runner to create multiple versions
  taskId: string;
  contentTypeSlug: string;
  promptData: Record<string, unknown>;
  totalCandidates: number;
  versions: DeliverableVersion[];
  winner: DeliverableVersion | null;
  generatedAt: string;
}

/**
 * Agent selection from task.config
 */
export interface AgentSelection {
  agentSlug: string;
  llmProvider: string;
  llmModel: string;
}

/**
 * Task configuration
 */
export interface TaskConfig {
  writers: AgentSelection[];
  editors: AgentSelection[];
  evaluators: AgentSelection[];
  execution: ExecutionConfig;
}

/**
 * Output row from marketing.outputs
 */
export interface OutputRow {
  id: string;
  task_id: string;
  writer_agent_slug: string;
  writer_llm_provider: string;
  writer_llm_model: string;
  editor_agent_slug: string | null;
  editor_llm_provider: string | null;
  editor_llm_model: string | null;
  content: string | null;
  status: string;
  edit_cycle: number;
  editor_feedback: string | null;
  initial_avg_score: number | null;
  initial_rank: number | null;
  is_finalist: boolean;
  final_total_score: number | null;
  final_rank: number | null;
  llm_metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/**
 * Evaluation row from marketing.evaluations
 */
export interface EvaluationRow {
  id: string;
  task_id: string;
  output_id: string;
  evaluator_agent_slug: string;
  evaluator_llm_provider: string;
  evaluator_llm_model: string;
  stage: 'initial' | 'final';
  status: string;
  score: number | null;
  rank: number | null;
  weighted_score: number | null;
  reasoning: string | null;
  llm_metadata: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Agent LLM config with is_local flag
 */
export interface AgentLlmConfig {
  id: string;
  agent_slug: string;
  llm_provider: string;
  llm_model: string;
  display_name: string | null;
  is_default: boolean;
  is_local: boolean;
}

/**
 * Agent personality
 */
export interface AgentPersonality {
  slug: string;
  name: string;
  role: 'writer' | 'editor' | 'evaluator';
  personality: Record<string, unknown>;
}

/**
 * Next action to process
 */
export interface NextAction {
  type: 'write' | 'edit' | 'rewrite' | 'evaluate_initial' | 'evaluate_final';
  output?: OutputRow;
  evaluation?: EvaluationRow;
  agentPersonality?: AgentPersonality;
  llmConfig?: AgentLlmConfig;
}

/**
 * Running counts by local/cloud
 */
export interface RunningCounts {
  local: number;
  cloud: number;
}

/**
 * MarketingDbService
 *
 * Database operations for the Marketing Swarm.
 * Implements the database-driven state machine approach.
 */
@Injectable()
export class MarketingDbService {
  private readonly logger = new Logger(MarketingDbService.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Create a new task record in marketing.swarm_tasks.
   *
   * Called by MarketingSwarmService.execute() when the task doesn't exist yet
   * (i.e., when invoked via the LangGraph runner rather than the old API runner).
   */
  async createTask(params: {
    taskId: string;
    organizationSlug: string;
    userId: string;
    conversationId: string;
    contentTypeSlug: string;
    promptData: Record<string, unknown>;
    config: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await this.db.from('marketing', 'swarm_tasks').insert({
      task_id: params.taskId,
      organization_slug: params.organizationSlug,
      user_id: params.userId,
      conversation_id: params.conversationId,
      content_type_slug: params.contentTypeSlug,
      prompt_data: params.promptData,
      config: params.config,
      status: 'pending',
    });

    if (error) {
      throw new Error(
        `Failed to create marketing swarm task: ${error.message}`,
      );
    }

    this.logger.log(`Created task: ${params.taskId}`);
  }

  /**
   * Get task configuration by task ID
   */
  async getTaskConfig(taskId: string): Promise<TaskConfig | null> {
    const { data, error } = (await this.db
      .from('marketing', 'swarm_tasks')
      .select('config')
      .eq('task_id', taskId)
      .single()) as {
      data: { config: TaskConfig } | null;
      error: { message: string; code?: string } | null;
    };

    if (error || !data) {
      this.logger.error(`Failed to get task config: ${error?.message}`);
      return null;
    }

    return data.config;
  }

  /**
   * Get task by conversation ID
   * Used to restore task state when navigating to an existing conversation
   */
  async getTaskByConversationId(
    conversationId: string,
  ): Promise<{ taskId: string; status: string } | null> {
    const { data, error } = (await this.db
      .from('marketing', 'swarm_tasks')
      .select('task_id, status')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()) as {
      data: { task_id: string; status: string } | null;
      error: { message: string; code?: string } | null;
    };

    if (error || !data) {
      if (error?.code !== 'PGRST116') {
        // PGRST116 = no rows found
        this.logger.error(
          `Failed to get task by conversation: ${error?.message}`,
        );
      }
      return null;
    }

    return {
      taskId: data.task_id,
      status: data.status,
    };
  }

  /**
   * Update task status
   */
  async updateTaskStatus(
    taskId: string,
    status: 'pending' | 'running' | 'completed' | 'failed',
    progress?: Record<string, unknown>,
    errorMessage?: string,
  ): Promise<void> {
    const updates: Record<string, unknown> = { status };

    if (status === 'running' && !progress) {
      updates.started_at = new Date().toISOString();
    }
    if (status === 'completed' || status === 'failed') {
      updates.completed_at = new Date().toISOString();
    }
    if (progress) {
      updates.progress = progress;
    }
    if (errorMessage) {
      updates.error_message = errorMessage;
    }

    const { error } = await this.db
      .from('marketing', 'swarm_tasks')
      .update(updates)
      .eq('task_id', taskId);

    if (error) {
      this.logger.error(`Failed to update task status: ${error.message}`);
    }
  }

  /**
   * Build the output matrix - create all output rows upfront
   * Writers × Editors combinations with status 'pending_write'
   */
  async buildOutputMatrix(
    taskId: string,
    config: TaskConfig,
  ): Promise<OutputRow[]> {
    const outputs: Partial<OutputRow>[] = [];

    // Create all writer × editor combinations
    for (const writer of config.writers) {
      for (const editor of config.editors) {
        outputs.push({
          id: uuidv4(),
          task_id: taskId,
          writer_agent_slug: writer.agentSlug,
          writer_llm_provider: writer.llmProvider,
          writer_llm_model: writer.llmModel,
          editor_agent_slug: editor.agentSlug,
          editor_llm_provider: editor.llmProvider,
          editor_llm_model: editor.llmModel,
          status: 'pending_write',
          edit_cycle: 0,
          is_finalist: false,
        });
      }
    }

    const { data, error } = (await this.db
      .from('marketing', 'outputs')
      .insert(outputs)
      .select()) as {
      data: OutputRow[] | null;
      error: { message: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to build output matrix: ${error.message}`);
      throw new Error(`Failed to build output matrix: ${error.message}`);
    }

    this.logger.log(`Built output matrix: ${(data ?? []).length} combinations`);
    return data ?? [];
  }

  /**
   * Get running counts by local/cloud
   */
  async getRunningCounts(taskId: string): Promise<RunningCounts> {
    // Query outputs that are currently in-progress
    const { data, error } = (await this.db.rpc(
      'get_running_counts',
      {
        p_task_id: taskId,
      },
      'marketing',
    )) as {
      data: Array<{ is_local: boolean; running_count: number }> | null;
      error: { message: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to get running counts: ${error.message}`);
      return { local: 0, cloud: 0 };
    }

    const counts: RunningCounts = { local: 0, cloud: 0 };
    for (const row of data ?? []) {
      if (row.is_local) {
        counts.local = Number(row.running_count);
      } else {
        counts.cloud = Number(row.running_count);
      }
    }

    return counts;
  }

  /**
   * Get next outputs to process (for writing/editing phase)
   */
  async getNextOutputs(
    taskId: string,
    isLocal: boolean,
    maxCount: number,
  ): Promise<OutputRow[]> {
    const { data, error } = (await this.db.rpc(
      'get_next_outputs',
      {
        p_task_id: taskId,
        p_is_local: isLocal,
        p_max_count: maxCount,
      },
      'marketing',
    )) as {
      data: Array<Record<string, unknown>> | null;
      error: { message: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to get next outputs: ${error.message}`);
      return [];
    }

    // Map output_id to id (function returns output_id as the column name)
    return (data ?? []).map((row: Record<string, unknown>) => ({
      ...row,
      id: row.output_id as string,
    })) as OutputRow[];
  }

  /**
   * Get all pending outputs for any status
   */
  async getPendingOutputs(
    taskId: string,
    statuses: string[],
  ): Promise<OutputRow[]> {
    const { data, error } = (await this.db
      .from('marketing', 'outputs')
      .select('*')
      .eq('task_id', taskId)
      .in('status', statuses)
      .order('created_at')) as {
      data: OutputRow[] | null;
      error: { message: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to get pending outputs: ${error.message}`);
      return [];
    }

    return data ?? [];
  }

  /**
   * Update output status (mark as in-progress)
   */
  async updateOutputStatus(
    outputId: string,
    status: string,
    additionalFields?: Partial<OutputRow>,
  ): Promise<void> {
    const updates: Record<string, unknown> = {
      status,
      ...additionalFields,
    };

    const { error } = await this.db
      .from('marketing', 'outputs')
      .update(updates)
      .eq('id', outputId);

    if (error) {
      this.logger.error(`Failed to update output status: ${error.message}`);
    }
  }

  /**
   * Update output with content (after writing completes)
   * Accumulates cost/tokens in llm_metadata instead of overwriting
   */
  async updateOutputContent(
    outputId: string,
    content: string,
    status: string,
    llmMetadata?: Record<string, unknown>,
  ): Promise<void> {
    // Accumulate costs instead of overwriting
    const accumulatedMetadata = await this.accumulateLlmMetadata(
      outputId,
      llmMetadata,
    );

    const { error } = await this.db
      .from('marketing', 'outputs')
      .update({
        content,
        status,
        llm_metadata: accumulatedMetadata,
      })
      .eq('id', outputId);

    if (error) {
      this.logger.error(`Failed to update output content: ${error.message}`);
    }
  }

  /**
   * Update output after editing
   * Accumulates cost/tokens in llm_metadata instead of overwriting
   */
  async updateOutputAfterEdit(
    outputId: string,
    content: string,
    status: string, // 'approved' or 'pending_rewrite'
    editorFeedback: string,
    editCycle: number,
    llmMetadata?: Record<string, unknown>,
  ): Promise<void> {
    // Accumulate costs instead of overwriting
    const accumulatedMetadata = await this.accumulateLlmMetadata(
      outputId,
      llmMetadata,
    );

    const { error } = await this.db
      .from('marketing', 'outputs')
      .update({
        content,
        status,
        editor_feedback: editorFeedback,
        edit_cycle: editCycle,
        llm_metadata: accumulatedMetadata,
      })
      .eq('id', outputId);

    if (error) {
      this.logger.error(`Failed to update output after edit: ${error.message}`);
    }
  }

  /**
   * Get agent personality by slug
   */
  async getAgentPersonality(
    agentSlug: string,
  ): Promise<AgentPersonality | null> {
    const { data, error } = (await this.db
      .from('marketing', 'agents')
      .select('slug, name, role, personality')
      .eq('slug', agentSlug)
      .single()) as {
      data: AgentPersonality | null;
      error: { message: string } | null;
    };

    if (error || !data) {
      this.logger.error(`Failed to get agent personality: ${error?.message}`);
      return null;
    }

    return data;
  }

  // Note: getLlmConfig was removed - LLM provider/model are now sent
  // directly in the config from the frontend

  /**
   * Check if all outputs are complete (approved, failed, or max_cycles_reached)
   */
  async areAllOutputsComplete(taskId: string): Promise<boolean> {
    const { count, error } = await this.db
      .from('marketing', 'outputs')
      .select('*', { count: 'exact', head: true })
      .eq('task_id', taskId)
      .not('status', 'in', '("approved","failed","max_cycles_reached")');

    if (error) {
      this.logger.error(`Failed to check outputs complete: ${error.message}`);
      return false;
    }

    return count === 0;
  }

  /**
   * Build initial evaluation rows for all evaluators × outputs
   */
  async buildInitialEvaluations(
    taskId: string,
    config: TaskConfig,
  ): Promise<EvaluationRow[]> {
    // Get all outputs ready for evaluation (approved or max_cycles_reached)
    const { data: outputs, error: outputsError } = (await this.db
      .from('marketing', 'outputs')
      .select('id')
      .eq('task_id', taskId)
      .in('status', ['approved', 'max_cycles_reached'])) as {
      data: Array<{ id: string }> | null;
      error: { message: string } | null;
    };

    if (outputsError || !outputs) {
      this.logger.error(
        `Failed to get outputs for evaluations: ${outputsError?.message}`,
      );
      return [];
    }

    const evaluations: Partial<EvaluationRow>[] = [];

    for (const output of outputs) {
      for (const evaluator of config.evaluators) {
        evaluations.push({
          id: uuidv4(),
          task_id: taskId,
          output_id: output.id,
          evaluator_agent_slug: evaluator.agentSlug,
          evaluator_llm_provider: evaluator.llmProvider,
          evaluator_llm_model: evaluator.llmModel,
          stage: 'initial',
          status: 'pending',
        });
      }
    }

    const { data, error } = (await this.db
      .from('marketing', 'evaluations')
      .insert(evaluations)
      .select()) as {
      data: EvaluationRow[] | null;
      error: { message: string } | null;
    };

    if (error) {
      this.logger.error(
        `Failed to build initial evaluations: ${error.message}`,
      );
      return [];
    }

    this.logger.log(`Built ${(data ?? []).length} initial evaluations`);
    return data ?? [];
  }

  /**
   * Get pending evaluations
   */
  async getPendingEvaluations(
    taskId: string,
    stage: 'initial' | 'final',
  ): Promise<EvaluationRow[]> {
    const { data, error } = (await this.db
      .from('marketing', 'evaluations')
      .select('*')
      .eq('task_id', taskId)
      .eq('stage', stage)
      .eq('status', 'pending')
      .order('created_at')) as {
      data: EvaluationRow[] | null;
      error: { message: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to get pending evaluations: ${error.message}`);
      return [];
    }

    return data ?? [];
  }

  /**
   * Update evaluation with score
   */
  async updateEvaluation(
    evaluationId: string,
    score: number | null,
    reasoning: string,
    status: string,
    rank?: number,
    weightedScore?: number,
    llmMetadata?: Record<string, unknown>,
  ): Promise<void> {
    const updates: Record<string, unknown> = {
      score,
      reasoning,
      status,
      llm_metadata: llmMetadata,
    };

    if (rank !== undefined) {
      updates.rank = rank;
    }
    if (weightedScore !== undefined) {
      updates.weighted_score = weightedScore;
    }

    const { error } = await this.db
      .from('marketing', 'evaluations')
      .update(updates)
      .eq('id', evaluationId);

    if (error) {
      this.logger.error(`Failed to update evaluation: ${error.message}`);
    }
  }

  /**
   * Check if all initial evaluations are complete (or failed - both are terminal states)
   */
  async areAllInitialEvaluationsComplete(taskId: string): Promise<boolean> {
    const { count, error } = await this.db
      .from('marketing', 'evaluations')
      .select('*', { count: 'exact', head: true })
      .eq('task_id', taskId)
      .eq('stage', 'initial')
      .in('status', ['pending', 'running']); // Only these are "incomplete"

    if (error) {
      this.logger.error(
        `Failed to check evaluations complete: ${error.message}`,
      );
      return false;
    }

    return count === 0;
  }

  /**
   * Calculate initial rankings and select finalists
   */
  async calculateInitialRankingsAndSelectFinalists(
    taskId: string,
    topN: number,
  ): Promise<number> {
    // Calculate rankings
    const { error: rankError } = (await this.db.rpc(
      'calculate_initial_rankings',
      { p_task_id: taskId },
      'marketing',
    )) as { data: unknown; error: { message: string } | null };

    if (rankError) {
      this.logger.error(`Failed to calculate rankings: ${rankError.message}`);
      return 0;
    }

    // Select finalists
    const { data, error: selectError } = (await this.db.rpc(
      'select_finalists',
      { p_task_id: taskId, p_top_n: topN },
      'marketing',
    )) as {
      data: Array<{ select_finalists: number }> | null;
      error: { message: string } | null;
    };

    if (selectError) {
      this.logger.error(`Failed to select finalists: ${selectError.message}`);
      return 0;
    }

    // RPC returns rows like [{ select_finalists: 5 }]
    const finalistCount = data?.[0]?.select_finalists ?? 0;
    this.logger.log(`Selected ${finalistCount} finalists`);
    return finalistCount;
  }

  /**
   * Build final evaluation rows for finalists
   */
  async buildFinalEvaluations(
    taskId: string,
    config: TaskConfig,
  ): Promise<EvaluationRow[]> {
    // Get finalist outputs
    const { data: finalists, error: finalistsError } = (await this.db
      .from('marketing', 'outputs')
      .select('id')
      .eq('task_id', taskId)
      .eq('is_finalist', true)) as {
      data: Array<{ id: string }> | null;
      error: { message: string } | null;
    };

    if (finalistsError || !finalists) {
      this.logger.error(`Failed to get finalists: ${finalistsError?.message}`);
      return [];
    }

    const evaluations: Partial<EvaluationRow>[] = [];

    for (const output of finalists) {
      for (const evaluator of config.evaluators) {
        evaluations.push({
          id: uuidv4(),
          task_id: taskId,
          output_id: output.id,
          evaluator_agent_slug: evaluator.agentSlug,
          evaluator_llm_provider: evaluator.llmProvider,
          evaluator_llm_model: evaluator.llmModel,
          stage: 'final',
          status: 'pending',
        });
      }
    }

    const { data, error } = (await this.db
      .from('marketing', 'evaluations')
      .insert(evaluations)
      .select()) as {
      data: EvaluationRow[] | null;
      error: { message: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to build final evaluations: ${error.message}`);
      return [];
    }

    this.logger.log(`Built ${(data ?? []).length} final evaluations`);
    return data ?? [];
  }

  /**
   * Check if all final evaluations are complete (or failed - both are terminal states)
   */
  async areAllFinalEvaluationsComplete(taskId: string): Promise<boolean> {
    const { count, error } = await this.db
      .from('marketing', 'evaluations')
      .select('*', { count: 'exact', head: true })
      .eq('task_id', taskId)
      .eq('stage', 'final')
      .in('status', ['pending', 'running']); // Only these are "incomplete"

    if (error) {
      this.logger.error(`Failed to check final evaluations: ${error.message}`);
      return false;
    }

    return count === 0;
  }

  /**
   * Calculate final rankings
   */
  async calculateFinalRankings(taskId: string): Promise<void> {
    const { error } = (await this.db.rpc(
      'calculate_final_rankings',
      {
        p_task_id: taskId,
      },
      'marketing',
    )) as { data: unknown; error: { message: string } | null };

    if (error) {
      this.logger.error(`Failed to calculate final rankings: ${error.message}`);
    }
  }

  /**
   * Get output by ID with full details
   */
  async getOutputById(outputId: string): Promise<OutputRow | null> {
    const { data, error } = (await this.db
      .from('marketing', 'outputs')
      .select('*')
      .eq('id', outputId)
      .single()) as {
      data: OutputRow | null;
      error: { message: string } | null;
    };

    if (error || !data) {
      return null;
    }

    return data;
  }

  /**
   * Get all outputs for a task
   */
  async getAllOutputs(taskId: string): Promise<OutputRow[]> {
    const { data, error } = (await this.db
      .from('marketing', 'outputs')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at')) as {
      data: OutputRow[] | null;
      error: { message: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to get all outputs: ${error.message}`);
      return [];
    }

    return data ?? [];
  }

  /**
   * Get all evaluations for a task
   */
  async getAllEvaluations(taskId: string): Promise<EvaluationRow[]> {
    const { data, error } = (await this.db
      .from('marketing', 'evaluations')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at')) as {
      data: EvaluationRow[] | null;
      error: { message: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to get all evaluations: ${error.message}`);
      return [];
    }

    return data ?? [];
  }

  /**
   * Get content type context
   */
  async getContentTypeContext(contentTypeSlug: string): Promise<string | null> {
    const { data, error } = (await this.db
      .from('marketing', 'content_types')
      .select('system_context')
      .eq('slug', contentTypeSlug)
      .single()) as {
      data: { system_context: string } | null;
      error: { message: string } | null;
    };

    if (error || !data) {
      return null;
    }

    return data.system_context;
  }

  /**
   * Get prompt data from task
   */
  async getPromptData(taskId: string): Promise<Record<string, unknown> | null> {
    const { data, error } = (await this.db
      .from('marketing', 'swarm_tasks')
      .select('prompt_data, content_type_slug')
      .eq('task_id', taskId)
      .single()) as {
      data: {
        prompt_data: Record<string, unknown>;
        content_type_slug: string;
      } | null;
      error: { message: string } | null;
    };

    if (error || !data) {
      return null;
    }

    return {
      promptData: data.prompt_data,
      contentTypeSlug: data.content_type_slug,
    };
  }

  /**
   * Delete all data for a task (evaluations, outputs, and the task itself)
   *
   * Order matters due to foreign key constraints:
   * 1. Delete evaluations (references outputs)
   * 2. Delete outputs (references swarm_tasks)
   * 3. Delete swarm_task
   *
   * @returns true if deletion was successful, false otherwise
   */
  async deleteTaskData(taskId: string): Promise<boolean> {
    this.logger.log(`Deleting all data for task: ${taskId}`);

    try {
      // 1. Delete evaluations first (references outputs)
      const { error: evalError } = await this.db
        .from('marketing', 'evaluations')
        .delete()
        .eq('task_id', taskId);

      if (evalError) {
        this.logger.error(`Failed to delete evaluations: ${evalError.message}`);
        return false;
      }

      // 2. Delete outputs (references swarm_tasks)
      const { error: outputError } = await this.db
        .from('marketing', 'outputs')
        .delete()
        .eq('task_id', taskId);

      if (outputError) {
        this.logger.error(`Failed to delete outputs: ${outputError.message}`);
        return false;
      }

      // 3. Delete the swarm_task
      const { error: taskError } = await this.db
        .from('marketing', 'swarm_tasks')
        .delete()
        .eq('task_id', taskId);

      if (taskError) {
        this.logger.error(`Failed to delete swarm_task: ${taskError.message}`);
        return false;
      }

      this.logger.log(`Successfully deleted all data for task: ${taskId}`);
      return true;
    } catch (error) {
      this.logger.error(`Error deleting task data: ${String(error)}`);
      return false;
    }
  }

  /**
   * Check if a task exists
   */
  async taskExists(taskId: string): Promise<boolean> {
    const { count, error } = await this.db
      .from('marketing', 'swarm_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('task_id', taskId);

    if (error) {
      this.logger.error(`Failed to check task exists: ${error.message}`);
      return false;
    }

    return (count ?? 0) > 0;
  }

  /**
   * Save an output version (for edit history tracking)
   *
   * Call this every time content is generated (initial write or rewrite).
   */
  async saveOutputVersion(
    outputId: string,
    taskId: string,
    content: string,
    actionType: 'write' | 'rewrite',
    editorFeedback: string | null,
    llmMetadata?: Record<string, unknown>,
  ): Promise<OutputVersionRow | null> {
    // Get current max version number for this output
    const { data: maxVersionData, error: maxError } = (await this.db
      .from('marketing', 'output_versions')
      .select('version_number')
      .eq('output_id', outputId)
      .order('version_number', { ascending: false })
      .limit(1)) as {
      data: Array<{ version_number: number }> | null;
      error: { message: string } | null;
    };

    if (maxError) {
      this.logger.error(`Failed to get max version: ${maxError.message}`);
      return null;
    }

    const nextVersion =
      maxVersionData && maxVersionData.length > 0
        ? maxVersionData[0]!.version_number + 1
        : 1;

    const { data, error } = (await this.db
      .from('marketing', 'output_versions')
      .insert({
        id: uuidv4(),
        output_id: outputId,
        task_id: taskId,
        version_number: nextVersion,
        content,
        action_type: actionType,
        editor_feedback: editorFeedback,
        llm_metadata: llmMetadata,
      })
      .select()
      .single()) as {
      data: OutputVersionRow | null;
      error: { message: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to save output version: ${error.message}`);
      return null;
    }

    this.logger.log(
      `Saved output version ${nextVersion} for output ${outputId}`,
    );
    return data;
  }

  /**
   * Get all versions for an output (edit history)
   */
  async getOutputVersions(outputId: string): Promise<OutputVersionRow[]> {
    const { data, error } = (await this.db
      .from('marketing', 'output_versions')
      .select('*')
      .eq('output_id', outputId)
      .order('version_number', { ascending: true })) as {
      data: OutputVersionRow[] | null;
      error: { message: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to get output versions: ${error.message}`);
      return [];
    }

    return data ?? [];
  }

  /**
   * Get all versions for a task (for deliverable)
   */
  async getAllVersionsForTask(taskId: string): Promise<OutputVersionRow[]> {
    const { data, error } = (await this.db
      .from('marketing', 'output_versions')
      .select('*')
      .eq('task_id', taskId)
      .order('output_id')
      .order('version_number', { ascending: true })) as {
      data: OutputVersionRow[] | null;
      error: { message: string } | null;
    };

    if (error) {
      this.logger.error(
        `Failed to get all versions for task: ${error.message}`,
      );
      return [];
    }

    return data ?? [];
  }

  /**
   * Generate the deliverable with top N ranked outputs and their edit histories
   */
  async getDeliverable(
    taskId: string,
    topN?: number,
  ): Promise<Deliverable | null> {
    // Get task info
    const { data: taskData, error: taskError } = (await this.db
      .from('marketing', 'swarm_tasks')
      .select('task_id, content_type_slug, prompt_data, config')
      .eq('task_id', taskId)
      .single()) as {
      data: {
        task_id: string;
        content_type_slug: string;
        prompt_data: Record<string, unknown>;
        config: TaskConfig;
      } | null;
      error: { message: string } | null;
    };

    if (taskError || !taskData) {
      this.logger.error(
        `Failed to get task for deliverable: ${taskError?.message}`,
      );
      return null;
    }

    const config = taskData.config;
    const deliveryCount = topN ?? config.execution.topNForDeliverable ?? 3;

    // Get all outputs ordered by final_rank (or initial_rank if no final)
    const { data: outputs, error: outputsError } = (await this.db
      .from('marketing', 'outputs')
      .select('*')
      .eq('task_id', taskId)
      .eq('status', 'approved')
      .not('final_rank', 'is', null)
      .order('final_rank', { ascending: true })
      .limit(deliveryCount)) as {
      data: OutputRow[] | null;
      error: { message: string } | null;
    };

    if (outputsError) {
      this.logger.error(
        `Failed to get outputs for deliverable: ${outputsError.message}`,
      );
      return null;
    }

    // If no final rankings, fall back to initial rankings
    let rankedOutputs = outputs ?? [];
    if (rankedOutputs.length === 0) {
      const { data: initialRanked, error: initialError } = (await this.db
        .from('marketing', 'outputs')
        .select('*')
        .eq('task_id', taskId)
        .eq('status', 'approved')
        .not('initial_rank', 'is', null)
        .order('initial_rank', { ascending: true })
        .limit(deliveryCount)) as {
        data: OutputRow[] | null;
        error: { message: string } | null;
      };

      if (initialError) {
        this.logger.error(
          `Failed to get initial ranked outputs: ${initialError.message}`,
        );
        return null;
      }

      rankedOutputs = initialRanked ?? [];
    }

    // Get total count
    const { count: totalCount } = (await this.db
      .from('marketing', 'outputs')
      .select('*', { count: 'exact', head: true })
      .eq('task_id', taskId)) as { count: number | null };

    // Get all versions and evaluations for the task
    const allVersions = await this.getAllVersionsForTask(taskId);
    const allEvaluations = await this.getAllEvaluations(taskId);

    // Build deliverable outputs with edit history
    const deliverableOutputs: DeliverableOutput[] = rankedOutputs.map(
      (output, index) => {
        // Get versions for this output
        const versions = allVersions.filter((v) => v.output_id === output.id);

        // Get evaluations for this output
        const evals = allEvaluations.filter((e) => e.output_id === output.id);

        return {
          rank: index + 1,
          outputId: output.id,
          writerAgentSlug: output.writer_agent_slug,
          editorAgentSlug: output.editor_agent_slug,
          finalContent: output.content || '',
          initialScore: output.initial_avg_score,
          finalScore: output.final_total_score,
          editHistory: versions.map((v) => ({
            version: v.version_number,
            content: v.content,
            actionType: v.action_type,
            editorFeedback: v.editor_feedback,
            createdAt: v.created_at,
          })),
          evaluations: evals.map((e) => ({
            stage: e.stage,
            evaluatorSlug: e.evaluator_agent_slug,
            score: e.score,
            rank: e.rank,
            reasoning: e.reasoning,
          })),
        };
      },
    );

    return {
      taskId,
      contentTypeSlug: taskData.content_type_slug,
      promptData: taskData.prompt_data,
      totalOutputs: totalCount ?? 0,
      deliveredCount: deliverableOutputs.length,
      rankedOutputs: deliverableOutputs,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get versioned deliverable for API runner
   *
   * Returns top N ranked outputs as versions in REVERSE rank order:
   * - Version 1 = lowest ranked (e.g., 5th place)
   * - Version N = highest ranked (1st place, the winner)
   *
   * This matches typical versioning where "latest is best"
   */
  async getVersionedDeliverable(
    taskId: string,
    topN?: number,
  ): Promise<VersionedDeliverable | null> {
    // Get task info
    const { data: taskData, error: taskError } = (await this.db
      .from('marketing', 'swarm_tasks')
      .select('task_id, content_type_slug, prompt_data, config')
      .eq('task_id', taskId)
      .single()) as {
      data: {
        task_id: string;
        content_type_slug: string;
        prompt_data: Record<string, unknown>;
        config: TaskConfig;
      } | null;
      error: { message: string } | null;
    };

    if (taskError || !taskData) {
      this.logger.error(
        `Failed to get task for versioned deliverable: ${taskError?.message}`,
      );
      return null;
    }

    const config = taskData.config;
    const deliveryCount = topN ?? config.execution.topNForDeliverable ?? 3;

    // Get all outputs ordered by final_rank (best first)
    const { data: outputs, error: outputsError } = (await this.db
      .from('marketing', 'outputs')
      .select('*')
      .eq('task_id', taskId)
      .eq('status', 'approved')
      .not('final_rank', 'is', null)
      .order('final_rank', { ascending: true })
      .limit(deliveryCount)) as {
      data: OutputRow[] | null;
      error: { message: string } | null;
    };

    if (outputsError) {
      this.logger.error(
        `Failed to get outputs for versioned deliverable: ${outputsError.message}`,
      );
      return null;
    }

    // If no final rankings, fall back to initial rankings
    let rankedOutputs = outputs ?? [];
    if (rankedOutputs.length === 0) {
      const { data: initialRanked, error: initialError } = (await this.db
        .from('marketing', 'outputs')
        .select('*')
        .eq('task_id', taskId)
        .eq('status', 'approved')
        .not('initial_rank', 'is', null)
        .order('initial_rank', { ascending: true })
        .limit(deliveryCount)) as {
        data: OutputRow[] | null;
        error: { message: string } | null;
      };

      if (initialError) {
        this.logger.error(
          `Failed to get initial ranked outputs: ${initialError.message}`,
        );
        return null;
      }

      rankedOutputs = initialRanked ?? [];
    }

    // Get total count
    const { count: totalCount } = (await this.db
      .from('marketing', 'outputs')
      .select('*', { count: 'exact', head: true })
      .eq('task_id', taskId)) as { count: number | null };

    // Build versions in REVERSE rank order (worst to best)
    // So version 1 = worst in selection, version N = winner
    const reversedOutputs = [...rankedOutputs].reverse();

    const versions: DeliverableVersion[] = reversedOutputs.map(
      (output, index) => {
        // Provider/model are now stored directly on the output row
        return {
          version: index + 1, // 1, 2, 3... (ascending)
          rank: output.final_rank ?? output.initial_rank ?? 0, // Original rank
          content: output.content || '',
          writerAgent: output.writer_agent_slug,
          editorAgent: output.editor_agent_slug,
          score: output.final_total_score ?? output.initial_avg_score,
          metadata: {
            outputId: output.id,
            editCycles: output.edit_cycle,
            initialScore: output.initial_avg_score,
            finalScore: output.final_total_score,
            writerLlmProvider: output.writer_llm_provider ?? 'unknown',
            writerLlmModel: output.writer_llm_model ?? 'unknown',
            editorLlmProvider: output.editor_llm_provider ?? null,
            editorLlmModel: output.editor_llm_model ?? null,
          },
        };
      },
    );

    // Winner is the last version (highest version number = best rank)
    const winner = versions.length > 0 ? versions[versions.length - 1]! : null;

    return {
      type: 'versioned' as const, // Signal to API runner to create versions
      taskId,
      contentTypeSlug: taskData.content_type_slug,
      promptData: taskData.prompt_data,
      totalCandidates: totalCount ?? 0,
      versions,
      winner,
      generatedAt: new Date().toISOString(),
    };
  }

  // ========================================
  // COST ACCUMULATION HELPERS
  // ========================================

  /**
   * Accumulate LLM metadata (cost, tokens) instead of overwriting
   * Fetches current values and adds new values to create running totals
   */
  private async accumulateLlmMetadata(
    outputId: string,
    newMetadata?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!newMetadata) {
      return {};
    }

    // Get current output to read existing metadata
    const { data: currentOutput } = (await this.db
      .from('marketing', 'outputs')
      .select('llm_metadata')
      .eq('id', outputId)
      .single()) as {
      data: { llm_metadata: Record<string, unknown> | null } | null;
      error: { message: string } | null;
    };

    const existingMetadata: Record<string, unknown> =
      currentOutput?.llm_metadata ?? {};

    // Accumulate values
    const existingCost = (existingMetadata.cost as number) || 0;
    const existingTokens = (existingMetadata.tokensUsed as number) || 0;
    const existingLatency = (existingMetadata.totalLatencyMs as number) || 0;
    const existingCallCount = (existingMetadata.llmCallCount as number) || 0;

    const newCost = (newMetadata.cost as number) || 0;
    const newTokens = (newMetadata.tokensUsed as number) || 0;
    const newLatency = (newMetadata.latencyMs as number) || 0;

    return {
      cost: existingCost + newCost,
      tokensUsed: existingTokens + newTokens,
      totalLatencyMs: existingLatency + newLatency,
      llmCallCount: existingCallCount + 1,
      // Keep last operation's latency for reference
      lastLatencyMs: newLatency,
    };
  }

  /**
   * Add evaluation cost to output's running total
   * Called after an evaluation completes for this output
   */
  async addEvaluationCostToOutput(
    outputId: string,
    evaluationCost: number,
    evaluationTokens: number,
  ): Promise<void> {
    // Get current output metadata
    const { data: currentOutput } = (await this.db
      .from('marketing', 'outputs')
      .select('llm_metadata')
      .eq('id', outputId)
      .single()) as {
      data: { llm_metadata: Record<string, unknown> | null } | null;
      error: { message: string } | null;
    };

    if (!currentOutput) {
      this.logger.warn(`Output not found for cost update: ${outputId}`);
      return;
    }

    const existingMetadata: Record<string, unknown> =
      currentOutput.llm_metadata ?? {};

    const existingCost = (existingMetadata.cost as number) || 0;
    const existingTokens = (existingMetadata.tokensUsed as number) || 0;
    const existingEvalCost = (existingMetadata.evaluationCost as number) || 0;
    const existingEvalTokens =
      (existingMetadata.evaluationTokens as number) || 0;

    const updatedMetadata = {
      ...existingMetadata,
      cost: existingCost + evaluationCost,
      tokensUsed: existingTokens + evaluationTokens,
      // Track evaluation costs separately for breakdown
      evaluationCost: existingEvalCost + evaluationCost,
      evaluationTokens: existingEvalTokens + evaluationTokens,
    };

    const { error } = await this.db
      .from('marketing', 'outputs')
      .update({ llm_metadata: updatedMetadata })
      .eq('id', outputId);

    if (error) {
      this.logger.error(
        `Failed to add evaluation cost to output: ${error.message}`,
      );
    }
  }
}
