import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  ExecutionContext,
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

export interface WorkflowAccess {
  userId: string;
  organizationSlug: string;
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
  async createTask(
    context: ExecutionContext,
    params: {
      taskId: string;
      contentTypeSlug: string;
      promptData: Record<string, unknown>;
      config: Record<string, unknown>;
    },
  ): Promise<void> {
    const { error } = await this.db.from('marketing', 'swarm_tasks').insert({
      task_id: params.taskId,
      organization_slug: context.orgSlug,
      user_id: context.userId,
      conversation_id: context.conversationId,
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

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get task config: ${error.message}`);
    }
    if (!data)
      throw new Error('Failed to get task config: database returned no row');

    return data.config;
  }

  async getTaskConfigForContext(
    taskId: string,
    context: ExecutionContext,
  ): Promise<TaskConfig | null> {
    const { data, error } = (await this.db
      .from('marketing', 'swarm_tasks')
      .select('config')
      .eq('task_id', taskId)
      .eq('conversation_id', context.conversationId)
      .eq('user_id', context.userId)
      .eq('organization_slug', context.orgSlug)
      .single()) as {
      data: { config: TaskConfig } | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get scoped task config: ${error.message}`);
    }
    if (!data) {
      throw new Error(
        'Failed to get scoped task config: database returned no row',
      );
    }
    return data.config;
  }

  async hasTaskAccess(
    taskId: string,
    access: WorkflowAccess,
  ): Promise<boolean> {
    let query = this.db
      .from('marketing', 'swarm_tasks')
      .select('task_id')
      .eq('task_id', taskId)
      .eq('user_id', access.userId);
    if (access.organizationSlug !== '*') {
      query = query.eq('organization_slug', access.organizationSlug);
    }

    const { data, error } = (await query.single()) as {
      data: { task_id: string } | null;
      error: { message: string; code?: string } | null;
    };
    if (error) {
      if (error.code === 'PGRST116') return false;
      throw new Error(`Failed to authorize workflow task: ${error.message}`);
    }
    if (!data) {
      throw new Error(
        'Failed to authorize workflow task: database returned no row',
      );
    }
    return true;
  }

  async getOutputTaskId(outputId: string): Promise<string | null> {
    const { data, error } = (await this.db
      .from('marketing', 'outputs')
      .select('task_id')
      .eq('id', outputId)
      .single()) as {
      data: { task_id: string } | null;
      error: { message: string; code?: string } | null;
    };
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to resolve workflow output: ${error.message}`);
    }
    if (!data) {
      throw new Error(
        'Failed to resolve workflow output: database returned no row',
      );
    }
    return data.task_id;
  }

  /**
   * Get task by conversation ID
   * Used to restore task state when navigating to an existing conversation
   */
  async getTaskByConversationId(
    conversationId: string,
    access: WorkflowAccess,
  ): Promise<{ taskId: string; status: string } | null> {
    let query = this.db
      .from('marketing', 'swarm_tasks')
      .select('task_id, status')
      .eq('conversation_id', conversationId)
      .eq('user_id', access.userId);
    if (access.organizationSlug !== '*') {
      query = query.eq('organization_slug', access.organizationSlug);
    }
    const { data, error } = (await query
      .order('created_at', { ascending: false })
      .limit(1)
      .single()) as {
      data: { task_id: string; status: string } | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get task by conversation: ${error.message}`);
    }
    if (!data) {
      throw new Error(
        'Failed to get task by conversation: database returned no row',
      );
    }

    return {
      taskId: data.task_id,
      status: data.status,
    };
  }

  /**
   * List swarm task runs for the Workflows sidebar (current user).
   */
  async listUserTasks(params: {
    userId: string;
    organizationSlug?: string;
    limit?: number;
  }): Promise<
    Array<{
      taskId: string;
      conversationId: string;
      status: string;
      contentTypeSlug: string;
      previewTitle: string;
      createdAt: string;
      updatedAt: string;
      completedAt: string | null;
    }>
  > {
    const limit = params.limit ?? 50;
    let query = this.db
      .from('marketing', 'swarm_tasks')
      .select(
        'task_id, conversation_id, status, content_type_slug, prompt_data, created_at, started_at, completed_at',
      )
      .eq('user_id', params.userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (params.organizationSlug && params.organizationSlug !== '*') {
      query = query.eq('organization_slug', params.organizationSlug);
    }

    const { data, error } = (await query) as {
      data: Array<{
        task_id: string;
        conversation_id: string;
        status: string;
        content_type_slug: string;
        prompt_data: Record<string, unknown> | null;
        created_at: string;
        started_at: string | null;
        completed_at: string | null;
      }> | null;
      error: { message: string } | null;
    };

    if (error) {
      throw new Error(`Failed to list swarm tasks: ${error.message}`);
    }

    if (!data) {
      throw new Error('Failed to list swarm tasks: database returned no rows');
    }

    return data.map((row) => ({
      taskId: row.task_id,
      conversationId: row.conversation_id,
      status: row.status,
      contentTypeSlug: row.content_type_slug,
      previewTitle: this.previewTitleFromPrompt(
        row.prompt_data,
        row.content_type_slug,
      ),
      createdAt: row.created_at,
      updatedAt: row.completed_at ?? row.started_at ?? row.created_at,
      completedAt: row.completed_at,
    }));
  }

  private previewTitleFromPrompt(
    promptData: Record<string, unknown> | null,
    contentTypeSlug: string,
  ): string {
    if (promptData) {
      const topic = promptData.topic ?? promptData.subject ?? promptData.title;
      if (typeof topic === 'string' && topic.trim().length > 0) {
        return topic.trim();
      }
    }
    return contentTypeSlug.replace(/-/g, ' ');
  }

  /**
   * Delete a swarm task and all related rows when owned by the given user.
   */
  async deleteTaskForUser(
    conversationId: string,
    userId: string,
    organizationSlug: string,
  ): Promise<boolean> {
    let query = this.db
      .from('marketing', 'swarm_tasks')
      .select('task_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);
    if (organizationSlug !== '*') {
      query = query.eq('organization_slug', organizationSlug);
    }
    const { data, error } = (await query.single()) as {
      data: { task_id: string } | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      if (error.code === 'PGRST116') return false;
      throw new Error(
        `Failed to resolve swarm task for deletion: ${error.message}`,
      );
    }
    if (!data) {
      throw new Error(
        'Failed to resolve swarm task for deletion: database returned no row',
      );
    }

    return this.deleteTaskData(data.task_id);
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
      throw new Error(`Failed to update task status: ${error.message}`);
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
      throw new Error(`Failed to build output matrix: ${error.message}`);
    }
    if (!data) {
      throw new Error(
        'Failed to build output matrix: database returned no rows',
      );
    }

    this.logger.log(`Built output matrix: ${data.length} combinations`);
    return data;
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
      throw new Error(`Failed to get running counts: ${error.message}`);
    }
    if (!data) {
      throw new Error(
        'Failed to get running counts: database returned no rows',
      );
    }

    const counts: RunningCounts = { local: 0, cloud: 0 };
    for (const row of data) {
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
      throw new Error(`Failed to get next outputs: ${error.message}`);
    }
    if (!data) {
      throw new Error('Failed to get next outputs: database returned no rows');
    }

    // Map output_id to id (function returns output_id as the column name)
    return data.map((row: Record<string, unknown>) => ({
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
      throw new Error(`Failed to get pending outputs: ${error.message}`);
    }
    if (!data) {
      throw new Error(
        'Failed to get pending outputs: database returned no rows',
      );
    }

    return data;
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
      throw new Error(`Failed to update output status: ${error.message}`);
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
      throw new Error(`Failed to update output content: ${error.message}`);
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
      throw new Error(`Failed to update output after edit: ${error.message}`);
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
      error: { message: string; code?: string } | null;
    };

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get agent personality: ${error.message}`);
    }
    if (!data) {
      throw new Error(
        'Failed to get agent personality: database returned no row',
      );
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
      .not('status', 'in', ['approved', 'failed', 'max_cycles_reached']);

    if (error) {
      throw new Error(`Failed to check outputs complete: ${error.message}`);
    }
    if (count === null) {
      throw new Error(
        'Failed to check outputs complete: database returned no count',
      );
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

    if (outputsError) {
      throw new Error(
        `Failed to get outputs for evaluations: ${outputsError.message}`,
      );
    }
    if (!outputs) {
      throw new Error(
        'Failed to get outputs for evaluations: database returned no rows',
      );
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
      throw new Error(`Failed to build initial evaluations: ${error.message}`);
    }
    if (!data) {
      throw new Error(
        'Failed to build initial evaluations: database returned no rows',
      );
    }

    this.logger.log(`Built ${data.length} initial evaluations`);
    return data;
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
      throw new Error(`Failed to get pending evaluations: ${error.message}`);
    }
    if (!data) {
      throw new Error(
        'Failed to get pending evaluations: database returned no rows',
      );
    }

    return data;
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
      throw new Error(`Failed to update evaluation: ${error.message}`);
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
      throw new Error(`Failed to check evaluations complete: ${error.message}`);
    }
    if (count === null) {
      throw new Error(
        'Failed to check evaluations complete: database returned no count',
      );
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
      throw new Error(`Failed to calculate rankings: ${rankError.message}`);
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
      throw new Error(`Failed to select finalists: ${selectError.message}`);
    }

    // RPC returns rows like [{ select_finalists: 5 }]
    const finalistCount = data?.[0]?.select_finalists;
    if (
      typeof finalistCount !== 'number' ||
      !Number.isInteger(finalistCount) ||
      finalistCount < 0
    ) {
      throw new Error(
        'Failed to select finalists: database returned invalid count',
      );
    }
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

    if (finalistsError) {
      throw new Error(`Failed to get finalists: ${finalistsError.message}`);
    }
    if (!finalists) {
      throw new Error('Failed to get finalists: database returned no rows');
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
      throw new Error(`Failed to build final evaluations: ${error.message}`);
    }
    if (!data) {
      throw new Error(
        'Failed to build final evaluations: database returned no rows',
      );
    }

    this.logger.log(`Built ${data.length} final evaluations`);
    return data;
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
      throw new Error(`Failed to check final evaluations: ${error.message}`);
    }
    if (count === null) {
      throw new Error(
        'Failed to check final evaluations: database returned no count',
      );
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
      throw new Error(`Failed to calculate final rankings: ${error.message}`);
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
      error: { message: string; code?: string } | null;
    };

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get output: ${error.message}`);
    }
    if (!data)
      throw new Error('Failed to get output: database returned no row');

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
      throw new Error(`Failed to get all outputs: ${error.message}`);
    }
    if (!data) {
      throw new Error('Failed to get all outputs: database returned no rows');
    }

    return data;
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
      throw new Error(`Failed to get all evaluations: ${error.message}`);
    }
    if (!data) {
      throw new Error(
        'Failed to get all evaluations: database returned no rows',
      );
    }

    return data;
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
      error: { message: string; code?: string } | null;
    };

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get content type context: ${error.message}`);
    }
    if (!data) {
      throw new Error(
        'Failed to get content type context: database returned no row',
      );
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
      error: { message: string; code?: string } | null;
    };

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get prompt data: ${error.message}`);
    }
    if (!data) {
      throw new Error('Failed to get prompt data: database returned no row');
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

    const { error } = await this.db
      .from('marketing', 'swarm_tasks')
      .delete()
      .eq('task_id', taskId);
    if (error) {
      throw new Error(`Failed to delete workflow task: ${error.message}`);
    }
    this.logger.log(`Successfully deleted all data for task: ${taskId}`);
    return true;
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
      throw new Error(`Failed to check task exists: ${error.message}`);
    }
    if (typeof count !== 'number') {
      throw new Error(
        'Failed to check task exists: database returned no count',
      );
    }

    return count > 0;
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
  ): Promise<OutputVersionRow> {
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
      throw new Error(`Failed to get max version: ${maxError.message}`);
    }
    if (!maxVersionData) {
      throw new Error('Failed to get max version: database returned no rows');
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
      throw new Error(`Failed to save output version: ${error.message}`);
    }
    if (!data) {
      throw new Error(
        'Failed to save output version: database returned no row',
      );
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
      throw new Error(`Failed to get output versions: ${error.message}`);
    }
    if (!data) {
      throw new Error(
        'Failed to get output versions: database returned no rows',
      );
    }

    return data;
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
      throw new Error(`Failed to get all versions for task: ${error.message}`);
    }
    if (!data) {
      throw new Error(
        'Failed to get all versions for task: database returned no rows',
      );
    }

    return data;
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
      error: { message: string; code?: string } | null;
    };

    if (taskError?.code === 'PGRST116') {
      return null;
    }
    if (taskError) {
      throw new Error(
        `Failed to get task for deliverable: ${taskError.message}`,
      );
    }
    if (!taskData) {
      throw new Error(
        'Failed to get task for deliverable: database returned no row',
      );
    }

    const config = taskData.config;
    const deliveryCount = topN ?? config.execution.topNForDeliverable;

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
      throw new Error(
        `Failed to get outputs for deliverable: ${outputsError.message}`,
      );
    }
    if (!outputs || outputs.length === 0) {
      throw new Error('Marketing Swarm completed without final ranked outputs');
    }
    const rankedOutputs = outputs;

    // Get total count
    const { count: totalCount, error: countError } = (await this.db
      .from('marketing', 'outputs')
      .select('*', { count: 'exact', head: true })
      .eq('task_id', taskId)) as {
      count: number | null;
      error: { message: string } | null;
    };
    if (countError) {
      throw new Error(
        `Failed to count workflow outputs: ${countError.message}`,
      );
    }
    if (totalCount === null) {
      throw new Error(
        'Failed to count workflow outputs: database returned no count',
      );
    }

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
          finalContent: this.requireOutputContent(output),
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
      totalOutputs: totalCount,
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
      error: { message: string; code?: string } | null;
    };

    if (taskError?.code === 'PGRST116') {
      return null;
    }
    if (taskError) {
      throw new Error(
        `Failed to get task for versioned deliverable: ${taskError.message}`,
      );
    }
    if (!taskData) {
      throw new Error(
        'Failed to get task for versioned deliverable: database returned no row',
      );
    }

    const config = taskData.config;
    const deliveryCount = topN ?? config.execution.topNForDeliverable;

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
      throw new Error(
        `Failed to get outputs for versioned deliverable: ${outputsError.message}`,
      );
    }
    if (!outputs || outputs.length === 0) {
      throw new Error('Marketing Swarm completed without final ranked outputs');
    }
    const rankedOutputs = outputs;

    // Get total count
    const { count: totalCount, error: countError } = (await this.db
      .from('marketing', 'outputs')
      .select('*', { count: 'exact', head: true })
      .eq('task_id', taskId)) as {
      count: number | null;
      error: { message: string } | null;
    };
    if (countError) {
      throw new Error(
        `Failed to count workflow outputs: ${countError.message}`,
      );
    }
    if (totalCount === null) {
      throw new Error(
        'Failed to count workflow outputs: database returned no count',
      );
    }

    // Build versions in REVERSE rank order (worst to best)
    // So version 1 = worst in selection, version N = winner
    const reversedOutputs = [...rankedOutputs].reverse();

    const versions: DeliverableVersion[] = reversedOutputs.map(
      (output, index) => {
        // Provider/model are now stored directly on the output row
        return {
          version: index + 1, // 1, 2, 3... (ascending)
          rank: this.requireFinalRank(output),
          content: this.requireOutputContent(output),
          writerAgent: output.writer_agent_slug,
          editorAgent: output.editor_agent_slug,
          score: output.final_total_score ?? output.initial_avg_score,
          metadata: {
            outputId: output.id,
            editCycles: output.edit_cycle,
            initialScore: output.initial_avg_score,
            finalScore: output.final_total_score,
            writerLlmProvider: output.writer_llm_provider,
            writerLlmModel: output.writer_llm_model,
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
      totalCandidates: totalCount,
      versions,
      winner,
      generatedAt: new Date().toISOString(),
    };
  }

  private requireOutputContent(output: OutputRow): string {
    if (typeof output.content !== 'string' || !output.content.trim()) {
      throw new Error(`Ranked output ${output.id} has no content`);
    }
    return output.content;
  }

  private requireFinalRank(output: OutputRow): number {
    if (!Number.isInteger(output.final_rank) || output.final_rank! < 1) {
      throw new Error(`Ranked output ${output.id} has no valid final rank`);
    }
    return output.final_rank!;
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
    // Get current output to read existing metadata
    const { data: currentOutput, error } = (await this.db
      .from('marketing', 'outputs')
      .select('llm_metadata')
      .eq('id', outputId)
      .single()) as {
      data: { llm_metadata: Record<string, unknown> | null } | null;
      error: { message: string } | null;
    };
    if (error) {
      throw new Error(`Failed to read output LLM metadata: ${error.message}`);
    }
    if (!currentOutput) {
      throw new Error(`Output not found for LLM metadata update: ${outputId}`);
    }

    const existingMetadata: Record<string, unknown> =
      currentOutput.llm_metadata ?? {};
    if (!newMetadata) {
      return existingMetadata;
    }

    // Accumulate values
    const existingCost = this.readMetric(existingMetadata, 'cost');
    const existingTokens = this.readMetric(existingMetadata, 'tokensUsed');
    const existingLatency = this.readMetric(existingMetadata, 'totalLatencyMs');
    const existingCallCount = this.readMetric(existingMetadata, 'llmCallCount');

    const newCost = this.readMetric(newMetadata, 'cost');
    const newTokens = this.readMetric(newMetadata, 'tokensUsed');
    const newLatency = this.readMetric(newMetadata, 'latencyMs');

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
    const { data: currentOutput, error: readError } = (await this.db
      .from('marketing', 'outputs')
      .select('llm_metadata')
      .eq('id', outputId)
      .single()) as {
      data: { llm_metadata: Record<string, unknown> | null } | null;
      error: { message: string } | null;
    };

    if (readError) {
      throw new Error(
        `Failed to read output cost metadata: ${readError.message}`,
      );
    }
    if (!currentOutput) {
      throw new Error(`Output not found for cost update: ${outputId}`);
    }

    const existingMetadata: Record<string, unknown> =
      currentOutput.llm_metadata ?? {};

    const existingCost = this.readMetric(existingMetadata, 'cost');
    const existingTokens = this.readMetric(existingMetadata, 'tokensUsed');
    const existingEvalCost = this.readMetric(
      existingMetadata,
      'evaluationCost',
    );
    const existingEvalTokens = this.readMetric(
      existingMetadata,
      'evaluationTokens',
    );

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
      throw new Error(
        `Failed to add evaluation cost to output: ${error.message}`,
      );
    }
  }

  private readMetric(metadata: Record<string, unknown>, key: string): number {
    const value = metadata[key];
    if (value === undefined) {
      return 0;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid LLM metadata metric: ${key}`);
    }
    return value;
  }
}
