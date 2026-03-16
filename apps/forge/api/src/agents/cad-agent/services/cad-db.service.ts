import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
} from '@orchestrator-ai/transport-types';
import { v4 as uuidv4 } from 'uuid';

/**
 * CAD constraints for project/drawing configuration
 */
export interface CadConstraints {
  units?: string; // 'mm', 'inches', etc.
  material?: string; // 'aluminum', 'steel', 'titanium', etc.
  manufacturingMethod?: string; // '3d-print', 'cnc', 'casting'
  toleranceClass?: string; // 'loose', 'standard', 'precision'
  minWallThickness?: number;
  [key: string]: unknown; // Allow additional custom constraints
}

/**
 * Project row from engineering.projects
 */
export interface Project {
  id: string;
  org_slug: string;
  name: string;
  description: string | null;
  constraints: CadConstraints;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/**
 * Drawing row from engineering.drawings
 */
export interface Drawing {
  id: string;
  project_id: string;
  task_id: string | null;
  conversation_id: string | null;
  name: string;
  description: string | null;
  prompt: string;
  version: number;
  parent_drawing_id: string | null;
  status:
    | 'pending'
    | 'generating'
    | 'validating'
    | 'executing'
    | 'exporting'
    | 'completed'
    | 'failed';
  constraints_override: CadConstraints | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  created_by: string | null;
}

/**
 * Generated code row from engineering.generated_code
 */
export interface GeneratedCode {
  id: string;
  drawing_id: string;
  code: string;
  code_type: 'opencascade-js' | 'cadquery';
  llm_provider: string;
  llm_model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  generation_time_ms: number | null;
  is_valid: boolean | null;
  validation_errors: string[];
  attempt_number: number;
  created_at: string;
}

/**
 * CAD output row from engineering.cad_outputs
 */
export interface CadOutput {
  id: string;
  drawing_id: string;
  generated_code_id: string | null;
  format: 'step' | 'stl' | 'gltf' | 'dxf' | 'thumbnail';
  storage_path: string;
  file_size_bytes: number | null;
  mesh_stats: Record<string, unknown> | null;
  export_time_ms: number | null;
  created_at: string;
}

/**
 * Execution log entry from engineering.execution_log
 */
export interface ExecutionLogEntry {
  id: string;
  drawing_id: string;
  step_type:
    | 'prompt_received'
    | 'constraints_applied'
    | 'llm_started'
    | 'llm_completed'
    | 'code_validation'
    | 'execution_started'
    | 'execution_completed'
    | 'execution_failed'
    | 'export_started'
    | 'export_completed'
    | 'error';
  message: string | null;
  details: Record<string, unknown>;
  duration_ms: number | null;
  created_at: string;
}

/**
 * CadDbService
 *
 * Database operations for the CAD Agent.
 * Manages projects, drawings, generated code, CAD outputs, and execution logs.
 *
 * Follows the database-driven state machine pattern similar to Marketing Swarm.
 */
@Injectable()
export class CadDbService {
  private readonly logger = new Logger(CadDbService.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  // ========================================
  // PROJECT OPERATIONS
  // ========================================

  /**
   * Create a new CAD project
   */
  async createProject(
    orgSlug: string,
    name: string,
    description?: string,
    constraints?: CadConstraints,
    createdBy?: string,
  ): Promise<Project> {
    const project: Partial<Project> = {
      id: uuidv4(),
      org_slug: orgSlug,
      name,
      description: description ?? null,
      constraints: constraints ?? {},
      metadata: {},
      created_by: createdBy ?? null,
    };

    const { data, error } = (await this.db
      .from('engineering', 'projects')
      .insert(project)
      .select()
      .single()) as {
      data: unknown;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to create project: ${error.message}`);
      throw new Error(`Failed to create project: ${error.message}`);
    }

    this.logger.log(
      `Created project: ${(data as Record<string, string>).id ?? ''} - ${(data as Record<string, string>).name ?? ''}`,
    );
    return data as Project;
  }

  /**
   * Get a project by ID
   */
  async getProject(projectId: string): Promise<Project | null> {
    const { data, error } = (await this.db
      .from('engineering', 'projects')
      .select('*')
      .eq('id', projectId)
      .single()) as {
      data: unknown;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return null;
      }
      this.logger.error(`Failed to get project: ${error.message}`);
      return null;
    }

    return data as Project;
  }

  /**
   * Find a project by name within an organization
   */
  async findProjectByName(
    orgSlug: string,
    name: string,
  ): Promise<Project | null> {
    const { data, error } = (await this.db
      .from('engineering', 'projects')
      .select('*')
      .eq('org_slug', orgSlug)
      .eq('name', name)
      .limit(1)
      .single()) as {
      data: unknown;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return null;
      }
      this.logger.error(`Failed to find project by name: ${error.message}`);
      return null;
    }

    return data as Project;
  }

  /**
   * Update a project
   */
  async updateProject(
    projectId: string,
    updates: Partial<Project>,
  ): Promise<Project> {
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = (await this.db
      .from('engineering', 'projects')
      .update(updateData)
      .eq('id', projectId)
      .select()
      .single()) as {
      data: unknown;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to update project: ${error.message}`);
      throw new Error(`Failed to update project: ${error.message}`);
    }

    this.logger.log(`Updated project: ${projectId}`);
    return data as Project;
  }

  // ========================================
  // DRAWING OPERATIONS
  // ========================================

  /**
   * Create a new drawing
   */
  async createDrawing(params: {
    projectId: string;
    name: string;
    prompt: string;
    taskId?: string;
    conversationId?: string;
    constraintsOverride?: CadConstraints;
    createdBy?: string;
  }): Promise<Drawing> {
    const drawing: Partial<Drawing> = {
      id: uuidv4(),
      project_id: params.projectId,
      name: params.name,
      prompt: params.prompt,
      constraints_override: params.constraintsOverride ?? null,
      task_id: params.taskId ?? null,
      conversation_id: params.conversationId ?? null,
      status: 'pending',
      version: 1,
      created_by: params.createdBy ?? null,
    };

    const { data, error } = (await this.db
      .from('engineering', 'drawings')
      .insert(drawing)
      .select()
      .single()) as {
      data: unknown;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to create drawing: ${error.message}`);
      throw new Error(`Failed to create drawing: ${error.message}`);
    }

    this.logger.log(
      `Created drawing: ${(data as Record<string, string>).id ?? ''} - ${(data as Record<string, string>).name ?? ''}`,
    );
    return data as Drawing;
  }

  /**
   * Create a new drawing with a specific ID (for using taskId as drawingId)
   */
  async createDrawingWithId(params: {
    id: string;
    projectId: string;
    name: string;
    prompt: string;
    taskId?: string;
    conversationId?: string;
    constraintsOverride?: CadConstraints;
    createdBy?: string;
  }): Promise<Drawing> {
    const drawing: Partial<Drawing> = {
      id: params.id, // Use provided ID instead of generating
      project_id: params.projectId,
      name: params.name,
      prompt: params.prompt,
      constraints_override: params.constraintsOverride ?? null,
      task_id: params.taskId ?? null,
      conversation_id: params.conversationId ?? null,
      status: 'pending',
      version: 1,
      created_by: params.createdBy ?? null,
    };

    const { data, error } = (await this.db
      .from('engineering', 'drawings')
      .insert(drawing)
      .select()
      .single()) as {
      data: unknown;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to create drawing with ID: ${error.message}`);
      throw new Error(`Failed to create drawing: ${error.message}`);
    }

    this.logger.log(
      `Created drawing with ID: ${(data as Record<string, string>).id ?? ''} - ${(data as Record<string, string>).name ?? ''}`,
    );
    return data as Drawing;
  }

  /**
   * Get a drawing by ID
   */
  async getDrawing(drawingId: string): Promise<Drawing | null> {
    const { data, error } = (await this.db
      .from('engineering', 'drawings')
      .select('*')
      .eq('id', drawingId)
      .single()) as {
      data: unknown;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return null;
      }
      this.logger.error(`Failed to get drawing: ${error.message}`);
      return null;
    }

    return data as Drawing;
  }

  /**
   * Update drawing status
   */
  async updateDrawingStatus(
    drawingId: string,
    status: Drawing['status'],
    errorMessage?: string,
  ): Promise<void> {
    const updates: Partial<Drawing> = {
      status,
      updated_at: new Date().toISOString(),
    };

    // If status is 'failed', log error via execution log
    if (status === 'failed' && errorMessage) {
      await this.logStep({
        drawingId,
        stepType: 'error',
        message: errorMessage,
      });
    }

    const { error } = (await this.db
      .from('engineering', 'drawings')
      .update(updates)
      .eq('id', drawingId)) as {
      data: unknown;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to update drawing status: ${error.message}`);
      throw new Error(`Failed to update drawing status: ${error.message}`);
    }

    this.logger.log(`Updated drawing ${drawingId} status to ${status}`);
  }

  /**
   * Complete a drawing (set status to completed)
   */
  async completeDrawing(drawingId: string): Promise<void> {
    await this.updateDrawingStatus(drawingId, 'completed');
  }

  // ========================================
  // GENERATED CODE OPERATIONS
  // ========================================

  /**
   * Save generated code for a drawing
   */
  async saveGeneratedCode(params: {
    drawingId: string;
    code: string;
    codeType: 'opencascade-js';
    llmProvider: string;
    llmModel: string;
    promptTokens?: number;
    completionTokens?: number;
    generationTimeMs?: number;
    attemptNumber?: number;
  }): Promise<GeneratedCode> {
    const generatedCode: Partial<GeneratedCode> = {
      id: uuidv4(),
      drawing_id: params.drawingId,
      code: params.code,
      code_type: params.codeType,
      llm_provider: params.llmProvider,
      llm_model: params.llmModel,
      prompt_tokens: params.promptTokens ?? null,
      completion_tokens: params.completionTokens ?? null,
      generation_time_ms: params.generationTimeMs ?? null,
      attempt_number: params.attemptNumber ?? 1,
    };

    const { data, error } = (await this.db
      .from('engineering', 'generated_code')
      .insert(generatedCode)
      .select()
      .single()) as {
      data: unknown;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to save generated code: ${error.message}`);
      throw new Error(`Failed to save generated code: ${error.message}`);
    }

    this.logger.log(
      `Saved generated code ${(data as Record<string, string>).id ?? ''} for drawing ${params.drawingId}`,
    );
    return data as GeneratedCode;
  }

  /**
   * Update code validation status
   */
  async updateCodeValidation(
    codeId: string,
    isValid: boolean,
    errors?: string[],
  ): Promise<void> {
    const updates: Partial<GeneratedCode> = {
      is_valid: isValid,
      validation_errors: errors ?? [],
    };

    const { error } = (await this.db
      .from('engineering', 'generated_code')
      .update(updates)
      .eq('id', codeId)) as {
      data: unknown;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to update code validation: ${error.message}`);
      throw new Error(`Failed to update code validation: ${error.message}`);
    }

    this.logger.log(
      `Updated code validation for ${codeId}: ${isValid ? 'valid' : 'invalid'}`,
    );
  }

  /**
   * Get the latest generated code for a drawing
   */
  async getLatestCode(drawingId: string): Promise<GeneratedCode | null> {
    const { data, error } = (await this.db
      .from('engineering', 'generated_code')
      .select('*')
      .eq('drawing_id', drawingId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()) as {
      data: unknown;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return null;
      }
      this.logger.error(`Failed to get latest code: ${error.message}`);
      return null;
    }

    return data as GeneratedCode;
  }

  // ========================================
  // CAD OUTPUT OPERATIONS
  // ========================================

  /**
   * Save CAD output file metadata
   */
  async saveCadOutput(params: {
    drawingId: string;
    generatedCodeId?: string;
    format: CadOutput['format'];
    storagePath: string;
    fileSizeBytes?: number;
    meshStats?: Record<string, unknown>;
    exportTimeMs?: number;
  }): Promise<CadOutput> {
    // Get latest code if not provided
    let codeId = params.generatedCodeId;
    if (!codeId) {
      const latestCode = await this.getLatestCode(params.drawingId);
      if (latestCode) {
        codeId = latestCode.id;
      }
    }

    const cadOutput: Partial<CadOutput> = {
      id: uuidv4(),
      drawing_id: params.drawingId,
      generated_code_id: codeId ?? null,
      format: params.format,
      storage_path: params.storagePath,
      file_size_bytes: params.fileSizeBytes ?? null,
      mesh_stats: params.meshStats ?? null,
      export_time_ms: params.exportTimeMs ?? null,
    };

    const { data, error } = (await this.db
      .from('engineering', 'cad_outputs')
      .insert(cadOutput)
      .select()
      .single()) as {
      data: unknown;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to save CAD output: ${error.message}`);
      throw new Error(`Failed to save CAD output: ${error.message}`);
    }

    this.logger.log(
      `Saved CAD output ${(data as Record<string, string>).id ?? ''} (${params.format}) for drawing ${params.drawingId}`,
    );
    return data as CadOutput;
  }

  /**
   * Get all CAD outputs for a drawing
   */
  async getDrawingOutputs(drawingId: string): Promise<CadOutput[]> {
    const { data, error } = (await this.db
      .from('engineering', 'cad_outputs')
      .select('*')
      .eq('drawing_id', drawingId)
      .order('created_at', { ascending: false })) as {
      data: unknown;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to get drawing outputs: ${error.message}`);
      return [];
    }

    return data as CadOutput[];
  }

  // ========================================
  // EXECUTION LOG OPERATIONS
  // ========================================

  /**
   * Log an execution step
   */
  async logStep(params: {
    drawingId: string;
    stepType: ExecutionLogEntry['step_type'];
    message?: string;
    details?: object;
    durationMs?: number;
  }): Promise<void> {
    const logEntry: Partial<ExecutionLogEntry> = {
      id: uuidv4(),
      drawing_id: params.drawingId,
      step_type: params.stepType,
      message: params.message ?? null,
      details: (params.details as Record<string, unknown>) ?? {},
      duration_ms: params.durationMs ?? null,
    };

    const { error } = (await this.db
      .from('engineering', 'execution_log')
      .insert(logEntry)) as {
      data: unknown;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      // Don't throw - logging failures shouldn't break the workflow
      this.logger.error(`Failed to log execution step: ${error.message}`);
      return;
    }

    this.logger.debug(
      `Logged execution step: ${params.stepType} for drawing ${params.drawingId}`,
    );
  }

  /**
   * Get execution log for a drawing
   */
  async getExecutionLog(drawingId: string): Promise<ExecutionLogEntry[]> {
    const { data, error } = (await this.db
      .from('engineering', 'execution_log')
      .select('*')
      .eq('drawing_id', drawingId)
      .order('created_at', { ascending: true })) as {
      data: unknown;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      this.logger.error(`Failed to get execution log: ${error.message}`);
      return [];
    }

    return data as ExecutionLogEntry[];
  }

  // ========================================
  // HELPER METHODS
  // ========================================

  /**
   * Get effective constraints for a drawing
   * (merges project constraints with drawing-specific overrides)
   */
  async getEffectiveConstraints(drawingId: string): Promise<CadConstraints> {
    const drawing = await this.getDrawing(drawingId);
    if (!drawing) {
      throw new Error(`Drawing not found: ${drawingId}`);
    }

    const project = await this.getProject(drawing.project_id);
    const projectConstraints = project?.constraints ?? {};
    const drawingConstraints = drawing.constraints_override ?? {};

    // Merge constraints (drawing overrides project)
    return {
      ...projectConstraints,
      ...drawingConstraints,
    };
  }

  /**
   * Get drawing by task ID (for workflow execution context)
   */
  async getDrawingByTaskId(taskId: string): Promise<Drawing | null> {
    const { data, error } = (await this.db
      .from('engineering', 'drawings')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()) as {
      data: unknown;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return null;
      }
      this.logger.error(`Failed to get drawing by task ID: ${error.message}`);
      return null;
    }

    return data as Drawing;
  }

  /**
   * Get drawing by conversation ID (for UI context)
   */
  async getDrawingByConversationId(
    conversationId: string,
  ): Promise<Drawing | null> {
    const { data, error } = (await this.db
      .from('engineering', 'drawings')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()) as {
      data: unknown;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return null;
      }
      this.logger.error(
        `Failed to get drawing by conversation ID: ${error.message}`,
      );
      return null;
    }

    return data as Drawing;
  }
}
