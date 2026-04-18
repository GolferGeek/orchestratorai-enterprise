import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  createFactsAgentGraph,
  type FactsAgentGraph,
} from './facts-agent.graph';
import type { FactsAgentInput, FactsAgentResult } from './facts-agent.types';
import type { FactsAgentState } from './facts-agent.state';
import { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../../../shared/services/observability.service';
import { PostgresCheckpointerService } from '../../../../shared/persistence/postgres-checkpointer.service';
import { LegalDocumentsStorageService } from '../../../jobs/legal-documents-storage.service';
import { MatterRepository } from '../../../matter/matter.repository';

@Injectable()
export class FactsAgentService implements OnModuleInit {
  private readonly logger = new Logger(FactsAgentService.name);
  private graph!: FactsAgentGraph;

  constructor(
    private readonly llmClient: LLMHttpClientService,
    private readonly observability: ObservabilityService,
    private readonly checkpointer: PostgresCheckpointerService,
    private readonly storage: LegalDocumentsStorageService,
    private readonly matterRepo: MatterRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing Facts Agent graph...');
    this.graph = await createFactsAgentGraph(
      this.llmClient,
      this.observability,
      this.checkpointer,
      this.storage,
      this.matterRepo,
    );
    this.logger.log('Facts Agent graph initialized');
  }

  async process(input: FactsAgentInput): Promise<FactsAgentResult> {
    const startTime = Date.now();
    const { context, matterId, documentId, storagePath } = input;

    // Each agent accumulates state in its matter-scoped thread.
    // Thread ID uses matterId — not documentId — so prior document context
    // is available in the checkpoint when subsequent documents are processed.
    const threadId = `matter-${matterId}-facts`;

    this.logger.log(
      `Facts Agent processing: matter=${matterId}, document=${documentId}, thread=${threadId}`,
    );

    try {
      const initialState: Partial<FactsAgentState> = {
        executionContext: context,
        matterId,
        documentId,
        storagePath,
        status: 'processing',
        startedAt: startTime,
      };

      const config = { configurable: { thread_id: threadId } };
      const finalState = (await this.graph.invoke(
        initialState,
        config,
      )) as FactsAgentState;

      const duration = Date.now() - startTime;
      this.logger.log(
        `Facts Agent complete: matter=${matterId}, document=${documentId}, ` +
          `entities=${finalState.entities.length}, timeline=${finalState.timelineEntries.length}, ` +
          `duration=${duration}ms`,
      );

      return {
        status: finalState.status === 'completed' ? 'completed' : 'failed',
        error: finalState.error,
        entitiesExtracted: finalState.entities.length,
        timelineEntriesExtracted: finalState.timelineEntries.length,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Facts Agent failed: matter=${matterId}, document=${documentId}: ${msg}`,
      );
      await this.observability.emitFailed(context, context.conversationId, msg);
      return {
        status: 'failed',
        error: msg,
        entitiesExtracted: 0,
        timelineEntriesExtracted: 0,
        duration,
      };
    }
  }
}
