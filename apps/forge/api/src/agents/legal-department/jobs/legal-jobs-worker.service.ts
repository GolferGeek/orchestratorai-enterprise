/**
 * LegalJobsWorkerService — single in-process worker for legal.agent_jobs.
 *
 * On a 1-second polling tick, claims the oldest queued row atomically (the
 * repository's claimNextQueued uses FOR UPDATE SKIP LOCKED, so concurrent ticks
 * cannot grab the same row), acquires the per-provider concurrency slot, runs
 * the existing LegalDepartmentService.process() against the job's
 * ExecutionContext, and updates the row state on success or failure.
 *
 * Key design notes:
 * - The job's stored conversation_id IS its ExecutionContext.conversationId.
 *   Every observability event the existing graph emits is already tagged with
 *   that id and lands in public.observability_events, so live and historical
 *   views of the job both come from the same source.
 * - ExecutionContext is reconstructed from the row and passed whole into the
 *   service — never destructured.
 * - Failures are surfaced as the real error string on the row; nothing is
 *   swallowed.
 *
 * See: docs/efforts/current/prd.md §4.1, §4.5
 */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import { isGraphInterrupt } from '@langchain/langgraph';
import { LegalDepartmentService } from '../legal-department.service';
import { LegalIntelligenceService } from '../services/legal-intelligence.service';
import { LegalJobsRepository } from './legal-jobs.repository';
import { LegalCapabilityConfigRepository } from './legal-capability-config.repository';
import { ProviderConcurrencyRegistry } from './provider-concurrency';
import { AgentJobRow, LEGAL_AGENT_SLUG } from './legal-jobs.types';
import {
  resolveModelForNode,
  setCapabilityModelConfig,
} from '../config/legal-model-config';

const POLL_INTERVAL_MS = 1000;

@Injectable()
export class LegalJobsWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LegalJobsWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  constructor(
    private readonly repository: LegalJobsRepository,
    private readonly concurrency: ProviderConcurrencyRegistry,
    private readonly legalDepartmentService: LegalDepartmentService,
    private readonly capabilityConfig: LegalCapabilityConfigRepository,
    private readonly legalIntelligence: LegalIntelligenceService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Preload the per-capability model config into the in-memory cache so
    // resolveModelForNode is sync on the hot path.
    try {
      const rows = await this.capabilityConfig.listForCapability(
        'document-onboarding',
      );
      setCapabilityModelConfig(rows);
    } catch (error) {
      this.logger.warn(
        `Failed to preload capability_model_config: ${error instanceof Error ? error.message : String(error)}. Workers will fall back to ExecutionContext.model.`,
      );
    }

    if (process.env.LEGAL_JOBS_WORKER_DISABLED === '1') {
      this.logger.warn(
        'LegalJobsWorkerService disabled via LEGAL_JOBS_WORKER_DISABLED=1',
      );
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_INTERVAL_MS);
    this.logger.log(
      `LegalJobsWorkerService started (poll=${POLL_INTERVAL_MS}ms)`,
    );
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * One polling tick: try to claim and run a single job. Re-entrancy is
   * guarded by `running` so a slow job never overlaps with the next tick.
   */
  async tick(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      const job = await this.repository.claimNextQueued();
      if (!job) return;
      await this.executeJob(job);
    } catch (error) {
      this.logger.error(
        `Worker tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  /**
   * Run a single job end-to-end. The job is already in `processing` state
   * (claimNextQueued flipped it). Three terminal outcomes:
   *   1. `completed` — graph ran to the end
   *   2. `awaiting_review` — graph hit a HITL interrupt(); worker releases
   *      its slot and leaves the decision to the reviewer
   *   3. `failed` — real error, surfaced as-is
   *
   * If the claimed row has `review_decision IS NOT NULL`, this is a resume
   * after a prior HITL — call LegalDepartmentService.resumeWithDecision
   * instead of process(), so the graph rehydrates from the checkpointer
   * with Command({ resume }).
   */
  async executeJob(job: AgentJobRow): Promise<void> {
    // Pull the input early so we know which capability this job belongs to.
    const inputData = (job.input?.data ?? {}) as {
      content?: string;
      contentType?: string;
      filename?: string;
      userMessage?: string;
      /** Phase 3: multi-doc array. Each entry may use filename or name field. */
      documents?: Array<{
        name?: string;
        filename?: string;
        content?: string;
        contentType?: string;
        type?: string;
      }>;
      /** Legacy single-doc metadata — ignored when documentsMetadata is present. */
      legalMetadata?: unknown;
      capabilitySlug?: string;
    };
    const capabilitySlug = inputData.capabilitySlug ?? 'document-onboarding';

    // Resolve the workhorse model from per-capability settings (with fallback
    // to whatever the row has). Use it both for concurrency gating and for
    // the ExecutionContext we hand to the graph.
    const tmpCtxForResolve: ExecutionContext = {
      orgSlug: job.org_slug,
      userId: job.user_id,
      conversationId: job.conversation_id,
      agentSlug: LEGAL_AGENT_SLUG,
      agentType: 'langgraph',
      provider: job.provider,
      model: job.model,
    };
    const workhorse = resolveModelForNode(
      tmpCtxForResolve,
      'contract-agent', // any specialist node maps to the workhorse role
      capabilitySlug,
    );

    const release = await this.concurrency.acquire(workhorse.provider);
    try {
      this.logger.log(
        `Running job ${job.id} (capability=${capabilitySlug}, provider=${workhorse.provider}, model=${workhorse.model}, conv=${job.conversation_id})`,
      );

      // Reconstruct ExecutionContext with the resolved workhorse model. The
      // capsule is built once here and passed whole into the service — never
      // destructured into individual fields.
      const context: ExecutionContext = {
        orgSlug: job.org_slug,
        userId: job.user_id,
        conversationId: job.conversation_id,
        agentSlug: LEGAL_AGENT_SLUG,
        agentType: 'langgraph',
        provider: workhorse.provider,
        model: workhorse.model,
      };

      // Build the documents array. Phase 3 multi-doc uploads store a
      // documents[] in inputData with {content, contentType, filename, ...}.
      // Normalize each entry to the {name, content, type} shape the graph
      // expects. Fall back to single-doc from inputData.content for legacy
      // JSON body jobs.
      const rawDocuments = inputData.documents;
      const documents: Array<{ name: string; content: string; type?: string }> =
        rawDocuments && rawDocuments.length > 0
          ? rawDocuments.map((d, i) => ({
              name: d.filename ?? d.name ?? `document-${i + 1}.txt`,
              content: d.content ?? '',
              type: d.contentType ?? d.type ?? 'text/plain',
            }))
          : inputData.content
            ? [
                {
                  name: inputData.filename ?? 'input.txt',
                  content: inputData.content,
                  type: inputData.contentType ?? 'text/plain',
                },
              ]
            : [];

      // Pre-compute legal metadata via dedicated LLM calls BEFORE the
      // graph runs — one call per document (Phase 3: parallel extraction).
      // The graph's routing logic depends on metadata being present to
      // take the full CLO-routing → specialist → synthesis → report path.
      // If extraction fails for any document we log a warning and continue
      // with partial or no metadata — the graph still completes.
      await this.repository.updateProgress(job.id, {
        current_step: 'extracting metadata',
        progress: 5,
        last_message: `Extracting legal metadata (${documents.length} document${documents.length !== 1 ? 's' : ''})`,
      });

      let documentsMetadata: Awaited<
        ReturnType<LegalIntelligenceService['extractMetadataForAll']>
      > = [];

      if (documents.length > 0) {
        try {
          documentsMetadata =
            await this.legalIntelligence.extractMetadataForAll(
              context,
              documents,
            );
          this.logger.log(
            `Job ${job.id} metadata extracted for ${documentsMetadata.length} doc(s): ` +
              documentsMetadata
                .map(
                  (m, i) =>
                    `[${i}] type=${m.documentType?.type ?? 'unknown'} confidence=${m.documentType?.confidence ?? 'n/a'}`,
                )
                .join(', '),
          );
        } catch (error) {
          this.logger.warn(
            `Job ${job.id} metadata extraction failed (continuing with simple path): ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      await this.repository.updateProgress(job.id, {
        current_step: 'running workflow',
        progress: 15,
        last_message:
          documentsMetadata.length > 0
            ? `Metadata extracted (${documentsMetadata.map((m) => m.documentType?.type ?? 'unknown').join(', ')})`
            : 'Running workflow without metadata',
      });

      // If this claim is a resume after a prior HITL, hand the decision to
      // the compiled graph instead of starting a fresh process() run.
      const result = job.review_decision
        ? await this.legalDepartmentService.resumeWithDecision(
            context,
            job.conversation_id,
            job.review_decision,
          )
        : await this.legalDepartmentService.process({
            context,
            userMessage: inputData.userMessage ?? inputData.content ?? '',
            documents,
            documentsMetadata,
          });

      if (result.status === 'completed') {
        await this.repository.markCompleted(job.id, {
          response: result.response,
          specialistOutputs: result.specialistOutputs,
          documentsMetadata: result.documentsMetadata,
          routingDecision: result.routingDecision,
          duration: result.duration,
        });
        // Resume runs may leave stale review_decision rows if something
        // re-queues without clearing; belt-and-suspenders cleanup here.
        if (job.review_decision) {
          await this.repository.clearReviewDecision(job.id);
        }
        this.logger.log(`Job ${job.id} completed in ${result.duration}ms`);
      } else {
        const message =
          result.error || 'Workflow returned non-completed status';
        await this.repository.markFailed(job.id, message);
        this.logger.warn(`Job ${job.id} failed: ${message}`);
      }
    } catch (error) {
      // HITL: the graph bubbled a GraphInterrupt up from hitl-checkpoint.
      // Flip the row to awaiting_review and release the slot. The worker
      // will re-dispatch it when the reviewer posts a decision.
      if (isGraphInterrupt(error)) {
        this.logger.log(
          `Job ${job.id} paused at HITL checkpoint (awaiting_review)`,
        );
        try {
          await this.repository.markAwaitingReview(job.id);
          if (job.review_decision) {
            // A resume hit another interrupt — clear the consumed decision
            // so the next reviewer round doesn't see a stale value.
            await this.repository.clearReviewDecision(job.id);
          }
        } catch (markError) {
          this.logger.error(
            `Failed to mark job ${job.id} as awaiting_review: ${markError instanceof Error ? markError.message : String(markError)}`,
          );
        }
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Job ${job.id} threw: ${message}`);
      try {
        await this.repository.markFailed(job.id, message);
      } catch (markError) {
        this.logger.error(
          `Failed to mark job ${job.id} as failed: ${markError instanceof Error ? markError.message : String(markError)}`,
        );
      }
    } finally {
      release();
    }
  }
}
