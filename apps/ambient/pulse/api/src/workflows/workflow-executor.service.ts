import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { WorkflowRegistryService, WorkflowDefinition, WorkflowRun } from './workflow-registry.service';
import { StreamingService } from '../streaming/streaming.service';
import { TriggerExecutorService } from '../services/trigger-executor.service';
import { AmbientDatabaseService } from '../ambient-database/database.service';
import { ExecutionContext, NIL_UUID } from '@orchestrator-ai/transport-types';

/**
 * Executes workflow definitions triggered by internal events.
 *
 * The executor:
 * 1. Receives trigger + payload from listener services (or manual invocation)
 * 2. Finds matching workflow definitions
 * 3. For workflows with action_config, delegates to TriggerExecutorService for A2A call
 * 4. For simple workflows, runs step-based execution
 * 5. Records outcomes and emits SSE events via StreamingService
 */
@Injectable()
export class WorkflowExecutorService {
  private readonly logger = new Logger(WorkflowExecutorService.name);

  constructor(
    private readonly registry: WorkflowRegistryService,
    private readonly streaming: StreamingService,
    private readonly triggerExecutor: TriggerExecutorService,
    private readonly database: AmbientDatabaseService,
  ) {}

  /**
   * Execute a specific workflow by ID (manual trigger).
   * If the workflow references a trigger by ID, delegates to TriggerExecutorService.
   * Otherwise executes steps directly.
   */
  async execute(
    workflowId: string,
    triggerData?: Record<string, unknown>,
  ): Promise<WorkflowRun> {
    const definition = this.registry.getById(workflowId);
    if (!definition) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const runId = `run-${randomUUID().slice(0, 8)}`;
    const run: WorkflowRun = {
      id: runId,
      workflowId,
      status: 'running',
      triggeredBy: 'manual',
      startedAt: new Date().toISOString(),
      completedAt: null,
      outcome: null,
      error: null,
    };

    this.registry.recordRun(run);
    this.streaming.emitWorkflowTriggered(workflowId, 'manual', triggerData);
    this.logger.log(`Executing workflow: ${definition.name} (run: ${runId})`);

    // Check if workflow has a linked trigger in the database
    const linkedTriggerId = (definition as WorkflowDefinition & { triggerId?: string }).triggerId;
    if (linkedTriggerId) {
      await this.executeViaLinkedTrigger(definition, linkedTriggerId, triggerData ?? {}, run);
    } else {
      await this.executeDirectA2A(definition, triggerData ?? {}, run);
    }

    return run;
  }

  /**
   * Trigger all workflows that match a given trigger type and optional filter.
   */
  async triggerByType(
    triggerType: WorkflowDefinition['trigger'],
    payload: Record<string, unknown>,
  ): Promise<WorkflowRun[]> {
    const matching = this.registry
      .getAll()
      .filter((wf) => wf.enabled && wf.trigger === triggerType);

    const runs = await Promise.all(
      matching.map(async (wf) => {
        const runId = `run-${randomUUID().slice(0, 8)}`;
        const run: WorkflowRun = {
          id: runId,
          workflowId: wf.id,
          status: 'running',
          triggeredBy: triggerType,
          startedAt: new Date().toISOString(),
          completedAt: null,
          outcome: null,
          error: null,
        };

        this.registry.recordRun(run);
        this.streaming.emitWorkflowTriggered(wf.id, triggerType, payload);

        const linkedTriggerId = (wf as WorkflowDefinition & { triggerId?: string }).triggerId;
        if (linkedTriggerId) {
          await this.executeViaLinkedTrigger(wf, linkedTriggerId, payload, run);
        } else {
          await this.executeDirectA2A(wf, payload, run);
        }

        return run;
      }),
    );

    return runs;
  }

  /**
   * Loads the linked trigger from the database and delegates to TriggerExecutorService.
   */
  private async executeViaLinkedTrigger(
    definition: WorkflowDefinition,
    triggerId: string,
    triggerData: Record<string, unknown>,
    run: WorkflowRun,
  ): Promise<void> {
    try {
      const triggers = await this.database.getTriggersByProduct('pulse');
      const trigger = triggers.find((t) => t.id === triggerId);

      if (!trigger) {
        throw new Error(`Linked trigger ${triggerId} not found in database`);
      }

      await this.triggerExecutor.execute(trigger, {
        sourceType: 'internal-a2a',
        triggerId: trigger.id,
        triggerName: trigger.name,
        payload: triggerData,
        timestamp: new Date().toISOString(),
      });

      run.status = 'completed';
      run.completedAt = new Date().toISOString();
      run.outcome = { delegatedToTrigger: triggerId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      run.status = 'failed';
      run.completedAt = new Date().toISOString();
      run.error = message;
      this.streaming.emitWorkflowFailed(definition.id, message);
      this.logger.error(`Workflow "${definition.name}" failed via linked trigger: ${message}`);
    }
  }

  /**
   * Builds a basic ExecutionContext from workflow steps and makes a direct A2A call.
   * Used for manual workflow executions that don't have a linked trigger.
   */
  private async executeDirectA2A(
    definition: WorkflowDefinition,
    triggerData: Record<string, unknown>,
    run: WorkflowRun,
  ): Promise<void> {
    // For workflows without a linked trigger, extract agent info from the first step.
    const firstStep = definition.steps[0];
    if (!firstStep) {
      // No steps — just mark complete.
      run.status = 'completed';
      run.completedAt = new Date().toISOString();
      run.outcome = { steps: {}, completedAt: new Date().toISOString() };
      this.streaming.emitWorkflowCompleted(definition.id, run.outcome);
      return;
    }

    const stepParams = (firstStep.params ?? {}) as {
      orgSlug?: string;
      agentSlug?: string;
      agentType?: string;
      provider?: string;
      model?: string;
      mode?: string;
    };

    const context: ExecutionContext = {
      orgSlug: stepParams.orgSlug ?? 'pulse-system',
      userId: 'system',
      conversationId: randomUUID(),
      taskId: randomUUID(),
      planId: NIL_UUID,
      deliverableId: NIL_UUID,
      agentSlug: stepParams.agentSlug ?? firstStep.action,
      agentType: stepParams.agentType ?? 'context',
      provider: stepParams.provider ?? 'default',
      model: stepParams.model ?? 'default',
    };

    const mode = stepParams.mode ?? 'converse';
    const a2aRequest = {
      jsonrpc: '2.0' as const,
      id: run.id,
      method: `${mode}.execute`,
      params: {
        context,
        mode,
        userMessage: `Workflow "${definition.name}" manual execution: ${JSON.stringify(triggerData)}`,
        payload: triggerData,
      },
    };

    const targetPort = context.agentType === 'langgraph' ? 6200 : 6300;
    const targetUrl = `http://localhost:${targetPort}/agent-to-agent/internal/tasks`;

    try {
      // Include INTERNAL_SERVICE_KEY for internal A2A authentication
      const serviceKey = process.env.INTERNAL_SERVICE_KEY;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (serviceKey) {
        headers['x-internal-service-key'] = serviceKey;
      }

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(a2aRequest),
      });

      const responseData = (await response.json()) as Record<string, unknown>;

      run.status = response.ok ? 'completed' : 'failed';
      run.completedAt = new Date().toISOString();
      run.outcome = { response: responseData };

      if (response.ok) {
        this.streaming.emitWorkflowCompleted(definition.id, run.outcome);
        this.logger.log(`Workflow "${definition.name}" completed via direct A2A call`);
      } else {
        run.error = `A2A call returned HTTP ${response.status}`;
        this.streaming.emitWorkflowFailed(definition.id, run.error);
        this.logger.error(`Workflow "${definition.name}" failed: HTTP ${response.status}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      run.status = 'failed';
      run.completedAt = new Date().toISOString();
      run.error = message;
      this.streaming.emitWorkflowFailed(definition.id, message);
      this.logger.error(`Workflow "${definition.name}" failed with network error: ${message}`);
    }
  }
}
