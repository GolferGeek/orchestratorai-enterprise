import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createCadAgentGraph, CadAgentGraph } from './cad-agent.graph';
import {
  CadAgentInput,
  CadAgentState,
  CadAgentResult,
  CadAgentStatus,
  CadOutputs,
} from './cad-agent.state';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';
import { CadDbService } from './services/cad-db.service';
import { CadStorageService } from './services/cad-storage.service';
import { OpenCascadeExecutorService } from './services/opencascade-executor.service';

/**
 * CadAgentService
 *
 * Manages the CAD Agent lifecycle:
 * - Creates and initializes the graph
 * - Handles CAD generation requests
 * - Provides status checking
 * - Retrieves drawing outputs from database
 */
@Injectable()
export class CadAgentService implements OnModuleInit {
  private readonly logger = new Logger(CadAgentService.name);
  private graph!: CadAgentGraph;

  constructor(
    private readonly llmClient: LLMHttpClientService,
    private readonly observability: ObservabilityService,
    private readonly checkpointer: PostgresCheckpointerService,
    private readonly cadDb: CadDbService,
    private readonly cadStorage: CadStorageService,
    private readonly occtExecutor: OpenCascadeExecutorService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing CAD Agent graph...');
    this.graph = await createCadAgentGraph(
      this.llmClient,
      this.observability,
      this.checkpointer,
      this.cadDb,
      this.cadStorage,
      this.occtExecutor,
    );
    this.logger.log('CAD Agent graph initialized');
  }

  /**
   * Generate a CAD model
   *
   * @param input - Input containing ExecutionContext and CAD generation params
   */
  async generate(input: CadAgentInput): Promise<CadAgentResult> {
    const startTime = Date.now();
    const { context } = input;

    // Validate required ExecutionContext fields
    if (!context.orgSlug) {
      throw new Error(
        'ExecutionContext.orgSlug is required for CAD generation',
      );
    }
    if (!context.conversationId) {
      throw new Error(
        'ExecutionContext.conversationId is required for CAD generation',
      );
    }
    if (!context.userId) {
      throw new Error('ExecutionContext.userId is required for CAD generation');
    }

    const taskId = context.conversationId;

    // Use taskId as drawingId - they're the same thing
    const drawingId = taskId;

    this.logger.log(
      `Starting CAD generation: taskId/drawingId=${taskId}, orgSlug=${context.orgSlug}`,
    );

    try {
      // Determine project ID - either use existing or create new
      let projectId = input.projectId;

      if (!projectId) {
        // Create a new project with the provided name
        if (input.newProjectName) {
          const project = await this.cadDb.createProject(
            context.orgSlug,
            input.newProjectName,
            `CAD project created from conversation ${context.conversationId}`,
            input.constraints,
            context.userId,
          );
          projectId = project.id;
          this.logger.log(
            `Created new project: ${projectId} - ${input.newProjectName}`,
          );
        } else {
          // Fallback: create a project named after the prompt
          const projectName =
            input.userMessage.slice(0, 50) +
            (input.userMessage.length > 50 ? '...' : '');
          const project = await this.cadDb.createProject(
            context.orgSlug,
            projectName,
            `CAD project created from conversation ${context.conversationId}`,
            input.constraints,
            context.userId,
          );
          projectId = project.id;
          this.logger.log(
            `Created project from prompt: ${projectId} - ${projectName}`,
          );
        }
      }

      // Create the drawing with conversationId as its ID
      // Note: task_id is omitted — invoke contract doesn't create task records,
      // and conversationId already provides the thread tracking we need.
      await this.cadDb.createDrawingWithId({
        id: drawingId,
        projectId,
        name: input.userMessage.slice(0, 100),
        prompt: input.userMessage,
        conversationId: context.conversationId,
        constraintsOverride: input.constraints,
      });
      this.logger.log(`Created drawing: ${drawingId}`);

      // Initial state - pass ExecutionContext directly
      const initialState: Partial<CadAgentState> = {
        executionContext: context,
        userMessage: input.userMessage,
        projectId,
        drawingId,
        constraints: input.constraints || {},
        status: 'pending',
        startedAt: startTime,
      };

      const config = {
        configurable: {
          thread_id: taskId,
        },
      };

      const finalState = (await this.graph.invoke(
        initialState,
        config,
      )) as CadAgentState;

      const duration = Date.now() - startTime;

      this.logger.log(
        `CAD generation completed: taskId=${taskId}, status=${finalState.status}, duration=${duration}ms`,
      );

      // Get output URLs from database
      const outputs = await this.getDrawingOutputs(drawingId);

      return {
        taskId,
        status: finalState.status === 'completed' ? 'completed' : 'failed',
        userMessage: input.userMessage,
        generatedCode: finalState.generatedCode,
        outputs,
        meshStats: finalState.meshStats,
        error: finalState.error,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `CAD generation failed: taskId=${taskId}, error=${errorMessage}`,
      );

      // Emit failure event — pass the full ExecutionContext (already in scope)
      await this.observability.emitFailed(
        context,
        taskId, // threadId
        errorMessage,
        duration,
      );

      return {
        taskId,
        status: 'failed',
        userMessage: input.userMessage,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Get status of a CAD generation by task ID
   */
  async getStatus(taskId: string): Promise<CadAgentStatus | null> {
    try {
      const config = {
        configurable: {
          thread_id: taskId,
        },
      };

      const state = await this.graph.getState(config);

      if (!state.values) {
        return null;
      }

      const values = state.values as CadAgentState;

      // Get output URLs from database if drawingId is available
      let outputs: CadOutputs | undefined;
      if (values.drawingId) {
        outputs = await this.getDrawingOutputs(values.drawingId);
      }

      return {
        taskId,
        status: values.status,
        userMessage: values.userMessage,
        executionStatus: values.executionStatus,
        isCodeValid: values.isCodeValid,
        outputs,
        error: values.error,
      };
    } catch (error) {
      this.logger.error(`Failed to get status for task ${taskId}:`, error);
      return null;
    }
  }

  /**
   * Get full state history for a task
   */
  async getHistory(taskId: string): Promise<CadAgentState[]> {
    try {
      const config = {
        configurable: {
          thread_id: taskId,
        },
      };

      const history: CadAgentState[] = [];
      for await (const state of this.graph.getStateHistory(config)) {
        history.push(state.values as CadAgentState);
      }

      return history;
    } catch (error) {
      this.logger.error(`Failed to get history for task ${taskId}:`, error);
      return [];
    }
  }

  /**
   * Helper method: Get output URLs from database for a drawing
   *
   * Database stores storage paths, this method converts them to public URLs
   */
  private async getDrawingOutputs(drawingId: string): Promise<CadOutputs> {
    const outputs = await this.cadDb.getDrawingOutputs(drawingId);

    // Convert database outputs to CadOutputs format
    // Note: storage_path contains the path, we need to convert to public URL
    const result: CadOutputs = {};

    for (const output of outputs) {
      const storagePath = output.storage_path;
      if (!storagePath) continue;

      // Convert storage path to public URL
      const url = this.cadStorage.getPublicUrl(storagePath);

      switch (output.format) {
        case 'step':
          result.step = url;
          break;
        case 'stl':
          result.stl = url;
          break;
        case 'gltf':
          result.gltf = url;
          break;
        case 'dxf':
          result.dxf = url;
          break;
        case 'thumbnail':
          result.thumbnail = url;
          break;
      }
    }

    return result;
  }
}
