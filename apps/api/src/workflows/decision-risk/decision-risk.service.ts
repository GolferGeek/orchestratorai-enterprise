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
    };
  }
}
