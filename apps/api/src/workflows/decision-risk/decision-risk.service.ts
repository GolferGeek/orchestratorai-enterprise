import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';
import { RiskStoreService } from './risk-store.service';
import {
  createDecisionRiskGraph,
  type DecisionRiskGraph,
} from './decision-risk.graph';
import type { DecisionRiskState } from './decision-risk.state';
import type { MonteCarloOutcome } from './monte-carlo';

export interface DecisionRiskResult {
  proposition: string;
  overallScore: number;
  overallConfidence: number;
  residualScore: number | null;
  dimensions: {
    slug: string;
    score: number;
    confidence: number;
    reasoning: string;
    evidence: string[];
  }[];
  debate: {
    originalScore: number;
    finalScore: number;
    adjustment: number;
  } | null;
  mitigations: {
    dimensionSlug: string;
    proposal: string;
    rationale: string;
    effort: string;
    residualScore: number;
  }[];
  executiveSummary: string;
  subjectId: string;
  monteCarlo: MonteCarloOutcome | null;
}

/** What a caller gets back immediately, before the work is done. */
export interface DecisionRiskRunHandle {
  runId: string;
  status: 'running';
}

@Injectable()
export class DecisionRiskService {
  private readonly logger = new Logger(DecisionRiskService.name);
  private graph: DecisionRiskGraph | null = null;

  constructor(
    private readonly llm: LLMHttpClientService,
    private readonly store: RiskStoreService,
    private readonly observability: ObservabilityService,
    private readonly checkpointer: PostgresCheckpointerService,
  ) {}

  /**
   * Compiled once; the graph holds no per-run state.
   *
   * The checkpointer is resolved lazily rather than in the constructor because
   * it opens a Postgres connection — doing that at module init would make the
   * API's boot depend on the database being reachable.
   */
  private async getGraph(): Promise<DecisionRiskGraph> {
    if (!this.graph) {
      this.graph = createDecisionRiskGraph({
        llm: this.llm,
        store: this.store,
        observability: this.observability,
        checkpointer: await this.checkpointer.getSaver(),
        logger: this.logger,
      });
    }
    return this.graph;
  }

  async assess(
    context: ExecutionContext,
    proposition: string,
    background = '',
  ): Promise<DecisionRiskResult> {
    this.logger.log(
      `Assessing decision risk for ${context.orgSlug}: ${proposition.slice(0, 80)}`,
    );

    const graph = await this.getGraph();
    const final = (await graph.invoke(
      { executionContext: context, proposition, background },
      // conversationId is the LangGraph thread, per the ExecutionContext rule.
      { configurable: { thread_id: context.conversationId } },
    )) as DecisionRiskState;

    if (final.overallScore === null || !final.executiveSummary) {
      throw new Error(
        'Decision risk graph finished without a score or summary. This is a bug, not an empty result.',
      );
    }

    return {
      proposition: final.proposition,
      overallScore: final.overallScore,
      overallConfidence: final.overallConfidence ?? 0,
      residualScore: final.residualScore,
      dimensions: final.assessments.map((a) => ({
        slug: a.dimensionSlug,
        score: a.score,
        confidence: a.confidence,
        reasoning: a.reasoning,
        evidence: a.evidence,
      })),
      debate: final.debate
        ? {
            originalScore: final.debate.originalScore,
            finalScore: final.debate.finalScore,
            adjustment: final.debate.adjustment,
          }
        : null,
      mitigations: final.mitigations.map((m) => ({
        dimensionSlug: m.dimensionSlug,
        proposal: m.proposal,
        rationale: m.rationale,
        effort: m.effort,
        residualScore: m.residualScore,
      })),
      executiveSummary: final.executiveSummary,
      subjectId: final.subjectId ?? '',
      monteCarlo: final.monteCarlo,
    };
  }

  /**
   * Start a run and return immediately.
   *
   * A run takes two to five minutes and the proxy in front of this API gives a
   * request sixty seconds. Holding the connection was never going to work — the
   * first live run returned 504 while the workflow carried on and completed
   * behind it. So the request opens a run row and returns its id; the caller
   * polls `getRun`, or watches the observability stream on the same id.
   */
  async startAssessment(
    context: ExecutionContext,
    proposition: string,
    background = '',
  ): Promise<DecisionRiskRunHandle> {
    const scope = await this.store.findScope(context.orgSlug, 'decision-risk');
    await this.store.startRun(context, scope.id, proposition, background);

    // Deliberately not awaited: the caller is answered now. Every failure path
    // below records itself against the run, so nothing is lost by letting go of
    // the promise — which is the only reason this is acceptable.
    void this.assess(context, proposition, background)
      .then(async (result) => {
        await this.store.completeRun(context.conversationId, {
          subjectId: result.subjectId || null,
          overallScore: result.overallScore,
          overallConfidence: result.overallConfidence,
          residualScore: result.residualScore,
          executiveSummary: result.executiveSummary,
          monteCarlo: result.monteCarlo,
        });
        this.logger.log(`Run ${context.conversationId} completed`);
      })
      .catch(async (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Run ${context.conversationId} failed: ${message}`,
          error instanceof Error ? error.stack : undefined,
        );
        try {
          await this.store.failRun(context.conversationId, message);
        } catch (writeError) {
          // The run is now unobservable to a poller, so say so loudly rather
          // than let it sit at 'running' forever.
          this.logger.error(
            `Could not record the failure of run ${context.conversationId}: ` +
              `${writeError instanceof Error ? writeError.message : String(writeError)}`,
          );
        }
      });

    return { runId: context.conversationId, status: 'running' };
  }

  /** Poll a run. Returns null when the id is unknown in this organization. */
  async getRun(
    runId: string,
    organizationSlug: string,
  ): Promise<Record<string, unknown> | null> {
    return this.store.getRun(runId, organizationSlug);
  }
}
