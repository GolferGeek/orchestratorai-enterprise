import {
  Injectable,
  Inject,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { filter, Observable } from 'rxjs';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import {
  MEDIA_STORAGE_PROVIDER,
  type MediaStorageProvider,
} from '@orchestratorai/planes/storage';
import {
  ObservabilityEventsService,
  type ObservabilityBufferEventRecord as ObservabilityEventRecord,
} from '@orchestratorai/planes/observability';

// Types based on database schema
export interface Project {
  id: string;
  org_slug: string;
  name: string;
  description?: string;
  constraints: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface Drawing {
  id: string;
  project_id: string;
  task_id?: string;
  conversation_id?: string;
  name: string;
  description?: string;
  prompt: string;
  version: number;
  parent_drawing_id?: string;
  status: string;
  constraints_override?: Record<string, unknown>;
  error_message?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  created_by?: string;
}

export interface GeneratedCode {
  id: string;
  drawing_id: string;
  code: string;
  code_type: string;
  llm_provider: string;
  llm_model: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  generation_time_ms?: number;
  is_valid?: boolean;
  validation_errors?: unknown[];
  attempt_number: number;
  created_at: string;
}

export interface CadOutput {
  id: string;
  drawing_id: string;
  generated_code_id?: string;
  format: string;
  storage_path: string;
  file_size_bytes?: number;
  mesh_stats?: Record<string, unknown>;
  export_time_ms?: number;
  created_at: string;
}

export interface ExecutionLogEntry {
  id: string;
  drawing_id: string;
  step_type: string;
  message?: string;
  details?: Record<string, unknown>;
  duration_ms?: number;
  created_at: string;
}

export interface CreateProjectParams {
  org_slug: string;
  name: string;
  description?: string;
  constraints?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  created_by?: string;
}

export interface UpdateProjectParams {
  name?: string;
  description?: string;
  constraints?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class EngineeringService {
  private readonly logger = new Logger(EngineeringService.name);

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly observabilityEvents: ObservabilityEventsService,
    @Inject(MEDIA_STORAGE_PROVIDER)
    private readonly mediaStorage: MediaStorageProvider,
  ) {}

  // =============================================================================
  // PROJECTS
  // =============================================================================

  /**
   * Create a new engineering project
   */
  async createProject(params: CreateProjectParams): Promise<Project> {
    // Verify organization exists
    const { data: orgData, error: orgError } = (await this.db
      .from(null, 'organizations')
      .select('slug')
      .eq('slug', params.org_slug)
      .single()) as QueryResult<unknown>;

    if (orgError || !orgData) {
      this.logger.error(
        `Organization not found: ${params.org_slug}`,
        orgError?.message,
      );
      throw new HttpException(
        `Organization '${params.org_slug}' not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    const insertData: Record<string, unknown> = {
      org_slug: params.org_slug,
      name: params.name,
      description: params.description || null,
      constraints: params.constraints || {},
      metadata: params.metadata || {},
    };

    if (params.created_by) {
      insertData.created_by = params.created_by;
    }

    const result = await this.db
      .from('engineering', 'projects')
      .insert(insertData)
      .select()
      .single();

    const data = result.data as Project | null;
    const error = result.error as { message?: string } | null;

    if (error || !data) {
      this.logger.error(
        `Failed to create project: ${error?.message || 'No data returned'}`,
      );
      throw new HttpException(
        `Failed to create project: ${error?.message || 'No data returned'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    this.logger.log(`Created engineering project: ${data.id}`);
    return data;
  }

  /**
   * List all projects for an organization
   */
  async listProjects(orgSlug: string): Promise<Project[]> {
    const { data, error } = (await this.db
      .from('engineering', 'projects')
      .select('*')
      .eq('org_slug', orgSlug)
      .order('created_at', { ascending: false })) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to list projects: ${error.message}`);
      throw new HttpException(
        `Failed to list projects: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return (data || []) as Project[];
  }

  /**
   * Get a single project by ID
   */
  async getProject(id: string): Promise<Project | null> {
    const result = await this.db
      .from('engineering', 'projects')
      .select('*')
      .eq('id', id)
      .single();

    const data = result.data as Project | null;
    const error = result.error as { code?: string; message?: string } | null;

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      this.logger.error(`Failed to get project: ${error.message}`);
      throw new HttpException(
        `Failed to get project: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return data;
  }

  /**
   * Update a project
   */
  async updateProject(
    id: string,
    updates: UpdateProjectParams,
  ): Promise<Project> {
    // Check if project exists
    const existing = await this.getProject(id);
    if (!existing) {
      throw new HttpException(
        `Project '${id}' not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    const updateData: Record<string, unknown> = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.constraints !== undefined)
      updateData.constraints = updates.constraints;
    if (updates.metadata !== undefined) updateData.metadata = updates.metadata;

    const result = await this.db
      .from('engineering', 'projects')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    const data = result.data as Project | null;
    const error = result.error as { message?: string } | null;

    if (error || !data) {
      this.logger.error(
        `Failed to update project: ${error?.message || 'No data returned'}`,
      );
      throw new HttpException(
        `Failed to update project: ${error?.message || 'No data returned'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    this.logger.log(`Updated engineering project: ${id}`);
    return data;
  }

  // =============================================================================
  // DRAWINGS
  // =============================================================================

  /**
   * Get a drawing with all related data
   */
  async getDrawing(id: string): Promise<Drawing | null> {
    const result = await this.db
      .from('engineering', 'drawings')
      .select('*')
      .eq('id', id)
      .single();

    const data = result.data as Drawing | null;
    const error = result.error as { code?: string; message?: string } | null;

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      this.logger.error(`Failed to get drawing: ${error.message}`);
      throw new HttpException(
        `Failed to get drawing: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return data;
  }

  /**
   * Get drawing by task ID
   */
  async getDrawingByTaskId(taskId: string): Promise<Drawing | null> {
    const result = await this.db
      .from('engineering', 'drawings')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const data = result.data as Drawing | null;
    const error = result.error as { code?: string; message?: string } | null;

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      this.logger.error(`Failed to get drawing by task ID: ${error.message}`);
      throw new HttpException(
        `Failed to get drawing by task ID: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return data;
  }

  /**
   * Get CAD outputs for a drawing
   */
  async getDrawingOutputs(drawingId: string): Promise<CadOutput[]> {
    const { data, error } = (await this.db
      .from('engineering', 'cad_outputs')
      .select('*')
      .eq('drawing_id', drawingId)
      .order('created_at', { ascending: false })) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to get drawing outputs: ${error.message}`);
      throw new HttpException(
        `Failed to get drawing outputs: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return (data || []) as CadOutput[];
  }

  /**
   * Get generated code for a drawing
   */
  async getGeneratedCode(drawingId: string): Promise<GeneratedCode[]> {
    const { data, error } = (await this.db
      .from('engineering', 'generated_code')
      .select('*')
      .eq('drawing_id', drawingId)
      .order('attempt_number', { ascending: false })) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to get generated code: ${error.message}`);
      throw new HttpException(
        `Failed to get generated code: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return (data || []) as GeneratedCode[];
  }

  /**
   * Get execution log for a drawing
   */
  async getExecutionLog(drawingId: string): Promise<ExecutionLogEntry[]> {
    const { data, error } = (await this.db
      .from('engineering', 'execution_log')
      .select('*')
      .eq('drawing_id', drawingId)
      .order('created_at', { ascending: true })) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to get execution log: ${error.message}`);
      throw new HttpException(
        `Failed to get execution log: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return (data || []) as ExecutionLogEntry[];
  }

  /**
   * Stream execution log progress events for a drawing via the observability bus.
   *
   * The CAD agent emits observability events tagged with the conversation ID that
   * was stored on the drawing when the drawing was created.  We filter the shared
   * ObservabilityEventsService stream by that conversation ID so that only events
   * belonging to this drawing's workflow are returned.
   *
   * Replaces the removed Supabase Realtime subscription.
   */
  getExecutionLogStream(
    conversationId: string,
  ): Observable<ObservabilityEventRecord> {
    return this.observabilityEvents.events$.pipe(
      filter((event) => event.context.conversationId === conversationId),
    );
  }

  /**
   * Get drawing with all related data (outputs, code, log)
   */
  async getDrawingWithDetails(id: string): Promise<{
    drawing: Drawing;
    outputs: CadOutput[];
    generatedCode: GeneratedCode[];
    executionLog: ExecutionLogEntry[];
  } | null> {
    const drawing = await this.getDrawing(id);
    if (!drawing) {
      return null;
    }

    const [outputs, generatedCode, executionLog] = await Promise.all([
      this.getDrawingOutputs(id),
      this.getGeneratedCode(id),
      this.getExecutionLog(id),
    ]);

    return {
      drawing,
      outputs,
      generatedCode,
      executionLog,
    };
  }

  // =============================================================================
  // CLEANUP
  // =============================================================================

  /**
   * Clean up all engineering data associated with a conversation.
   * Deletes storage files and database records (drawings cascade to code, outputs, logs).
   */
  async cleanupConversationData(conversationId: string): Promise<void> {
    // Find all drawings linked to this conversation
    const { data: drawings, error: drawingsError } = (await this.db
      .from('engineering', 'drawings')
      .select('id')
      .eq('conversation_id', conversationId)) as QueryResult<unknown>;

    if (drawingsError) {
      this.logger.warn(
        `Failed to fetch engineering drawings for conversation ${conversationId}: ${drawingsError.message}`,
      );
      return;
    }

    if (!drawings || (drawings as unknown[]).length === 0) {
      this.logger.debug(
        `No engineering drawings to clean up for conversation ${conversationId}`,
      );
      return;
    }

    const drawingIds = (drawings as Record<string, unknown>[]).map(
      (d) => d.id as string,
    );
    this.logger.log(
      `Cleaning up ${drawingIds.length} engineering drawing(s) for conversation ${conversationId}`,
    );

    // Find all CAD outputs with storage paths to delete from storage
    const { data: cadOutputs, error: cadOutputsError } = (await this.db
      .from('engineering', 'cad_outputs')
      .select('id, storage_path')
      .in('drawing_id', drawingIds)) as QueryResult<unknown>;

    if (cadOutputsError) {
      this.logger.warn(
        `Failed to fetch CAD outputs: ${cadOutputsError.message}`,
      );
    } else if (cadOutputs && (cadOutputs as unknown[]).length > 0) {
      // Delete storage files from engineering bucket (Supabase Storage API)
      const storagePaths = (cadOutputs as Record<string, unknown>[])
        .map((o) => o.storage_path as string)
        .filter((p) => p);

      if (storagePaths.length > 0) {
        const result = await this.mediaStorage.deleteStorageObjects(
          'engineering',
          storagePaths,
        );

        if (result.errors.length > 0) {
          this.logger.warn(
            `Failed to delete CAD storage files: ${result.errors.join(', ')}`,
          );
        } else {
          this.logger.debug(
            `Deleted ${result.deleted} CAD file(s) from engineering bucket`,
          );
        }
      }
    }

    // Delete drawings (generated_code, cad_outputs, execution_log cascade automatically)
    const { error: deleteError } = (await this.db
      .from('engineering', 'drawings')
      .delete()
      .in('id', drawingIds)) as QueryResult<unknown>;

    if (deleteError) {
      this.logger.warn(
        `Failed to delete engineering drawings: ${deleteError.message}`,
      );
    } else {
      this.logger.log(
        `Successfully cleaned up engineering CAD data for conversation ${conversationId}`,
      );
    }
  }
}
