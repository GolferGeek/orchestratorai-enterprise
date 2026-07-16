import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  createDocumentsAgentGraph,
  type DocumentsAgentGraph,
} from './documents-agent.graph';
import type {
  DocumentsAgentInput,
  DocumentsAgentResult,
} from './documents-agent.types';
import type { DocumentsAgentState } from './documents-agent.state';
import { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../../../shared/services/observability.service';
import { PostgresCheckpointerService } from '../../../../shared/persistence/postgres-checkpointer.service';
import { LegalDocumentsStorageService } from '../../../jobs/legal-documents-storage.service';
import { MatterRepository } from '../../../matter/matter.repository';

@Injectable()
export class DocumentsAgentService implements OnModuleInit {
  private readonly logger = new Logger(DocumentsAgentService.name);
  private graph!: DocumentsAgentGraph;

  constructor(
    private readonly llmClient: LLMHttpClientService,
    private readonly observability: ObservabilityService,
    private readonly checkpointer: PostgresCheckpointerService,
    private readonly storage: LegalDocumentsStorageService,
    private readonly matterRepo: MatterRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing Documents Agent graph...');
    this.graph = await createDocumentsAgentGraph(
      this.llmClient,
      this.observability,
      this.checkpointer,
      this.storage,
      this.matterRepo,
    );
    this.logger.log('Documents Agent graph initialized');
  }

  async process(input: DocumentsAgentInput): Promise<DocumentsAgentResult> {
    const startTime = Date.now();
    const { context, matterId, documentId, storagePath } = input;

    const threadId = `matter-${matterId}-documents`;

    this.logger.log(
      `Documents Agent processing: matter=${matterId}, document=${documentId}, thread=${threadId}`,
    );

    try {
      const initialState: Partial<DocumentsAgentState> = {
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
      )) as DocumentsAgentState;

      const duration = Date.now() - startTime;
      this.logger.log(
        `Documents Agent complete: matter=${matterId}, document=${documentId}, ` +
          `class=${finalState.documentClass ?? 'unknown'}, duration=${duration}ms`,
      );

      return {
        status: finalState.status === 'completed' ? 'completed' : 'failed',
        error: finalState.error,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Documents Agent failed: matter=${matterId}, document=${documentId}: ${msg}`,
      );
      await this.observability.emitFailed(context, context.conversationId, msg);
      return { status: 'failed', error: msg, duration };
    }
  }
}
