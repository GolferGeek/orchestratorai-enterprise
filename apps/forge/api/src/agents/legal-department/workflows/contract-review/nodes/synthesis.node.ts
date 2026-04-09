/**
 * Contract-review synthesis — clause-level merge of specialist annotations.
 *
 * Groups all ClauseAnnotation[] arrays by clauseId, calls the LLM to merge
 * per-clause findings into ClauseSynthesis[], and builds the RedlineOutput
 * structure with risk breakdown and overall assessment.
 */
import { LegalDepartmentState } from '../../../legal-department.state';
import type {
  ClauseAnnotation,
  ClauseSynthesis,
  RedlineOutput,
} from '../../../legal-department.types';
import { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import { stripMarkdownFences } from '../../../nodes/specialist-utils';

const AGENT_SLUG = 'legal-department';

export function createContractReviewSynthesisNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function synthesisNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Contract Review Synthesis: Merging clause annotations',
      { step: 'cr_synthesis', progress: 75 },
    );

    try {
      const clauseMap = state.clauseMap;
      if (!clauseMap) {
        return {
          error: 'No clause map available for synthesis',
          status: 'failed',
        };
      }

      // Collect all annotations from all specialists
      const allAnnotations: ClauseAnnotation[] = [];
      for (const output of Object.values(state.specialistOutputs ?? {})) {
        if (Array.isArray(output)) {
          allAnnotations.push(...(output as ClauseAnnotation[]));
        }
      }

      // Group annotations by clauseId
      const byClause = new Map<string, ClauseAnnotation[]>();
      for (const ann of allAnnotations) {
        const existing = byClause.get(ann.clauseId) ?? [];
        existing.push(ann);
        byClause.set(ann.clauseId, existing);
      }

      // Build clause syntheses — one per clause map entry
      const clauseSyntheses: ClauseSynthesis[] = [];
      for (const entry of clauseMap.entries) {
        const annotations = byClause.get(entry.clauseId) ?? [];
        const overallRisk = computeOverallRisk(annotations);

        let suggestedRedline: string | undefined;
        let summary: string;

        if (annotations.length === 0) {
          summary = 'No issues identified by any specialist.';
        } else if (annotations.length === 1) {
          summary = annotations[0]!.finding;
          suggestedRedline = annotations[0]!.suggestedLanguage;
        } else {
          // Multiple specialists flagged this clause — need LLM merge
          const mergeResult = await mergeClauseAnnotations(
            llmClient,
            ctx,
            entry.text,
            annotations,
          );
          summary = mergeResult.summary;
          suggestedRedline = mergeResult.suggestedRedline;
        }

        clauseSyntheses.push({
          clauseId: entry.clauseId,
          originalText: entry.text,
          overallRisk,
          annotations,
          suggestedRedline,
          summary,
        });
      }

      // Build risk breakdown
      const riskBreakdown = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        acceptable: 0,
      };
      for (const cs of clauseSyntheses) {
        riskBreakdown[cs.overallRisk]++;
      }

      const flaggedClauses = clauseSyntheses.filter(
        (cs) => cs.overallRisk !== 'acceptable',
      ).length;

      const redlineOutput: RedlineOutput = {
        clauses: clauseSyntheses,
        riskBreakdown,
        totalClauses: clauseSyntheses.length,
        flaggedClauses,
        overallRisk: computeDocumentRisk(riskBreakdown),
      };

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Contract Review Synthesis: ${flaggedClauses}/${clauseSyntheses.length} clauses flagged`,
        { step: 'cr_synthesis_complete', progress: 80, flaggedClauses },
      );

      return {
        redlineOutput,
        orchestration: {
          ...state.orchestration,
          synthesis: {
            executiveSummary: `Contract review identified ${flaggedClauses} clauses with potential issues out of ${clauseSyntheses.length} total clauses.`,
            keyFindings: allAnnotations
              .filter(
                (a) => a.riskLevel === 'critical' || a.riskLevel === 'high',
              )
              .map((a) => ({
                specialist: a.category,
                finding: a.finding,
                severity: a.riskLevel as 'critical' | 'high' | 'medium' | 'low',
              })),
            overallRisk: {
              level: redlineOutput.overallRisk as
                | 'critical'
                | 'high'
                | 'medium'
                | 'low',
              description: `${riskBreakdown.critical} critical, ${riskBreakdown.high} high, ${riskBreakdown.medium} medium risk clauses identified.`,
              factors: [
                ...new Set(
                  allAnnotations
                    .filter(
                      (a) =>
                        a.riskLevel === 'critical' || a.riskLevel === 'high',
                    )
                    .map((a) => a.category),
                ),
              ],
            },
            recommendations: allAnnotations
              .filter((a) => a.suggestedLanguage)
              .map(
                (a) =>
                  `[${a.clauseId}] ${a.category}: ${a.finding.slice(0, 100)}`,
              ),
            confidence: 0.85,
          },
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      await observability.emitFailed(
        ctx,
        ctx.conversationId,
        `Contract Review Synthesis failed: ${msg}`,
        Date.now() - state.startedAt,
      );

      return { error: `Contract Review Synthesis: ${msg}`, status: 'failed' };
    }
  };
}

/** Compute the highest risk level from a set of annotations. */
function computeOverallRisk(
  annotations: ClauseAnnotation[],
): ClauseSynthesis['overallRisk'] {
  if (annotations.length === 0) return 'acceptable';
  const order: ClauseSynthesis['overallRisk'][] = [
    'critical',
    'high',
    'medium',
    'low',
    'acceptable',
  ];
  for (const level of order) {
    if (annotations.some((a) => a.riskLevel === level)) return level;
  }
  return 'acceptable';
}

/** Compute the overall document risk from the risk breakdown. */
function computeDocumentRisk(riskBreakdown: {
  critical: number;
  high: number;
  medium: number;
  low: number;
  acceptable: number;
}): RedlineOutput['overallRisk'] {
  if (riskBreakdown.critical > 0) return 'critical';
  if (riskBreakdown.high > 0) return 'high';
  if (riskBreakdown.medium > 0) return 'medium';
  if (riskBreakdown.low > 0) return 'low';
  return 'acceptable';
}

/** LLM merge for clauses with multiple specialist annotations. */
async function mergeClauseAnnotations(
  llmClient: LLMHttpClientService,
  ctx: import('@orchestrator-ai/transport-types').ExecutionContext,
  clauseText: string,
  annotations: ClauseAnnotation[],
): Promise<{ summary: string; suggestedRedline?: string }> {
  const systemMessage = `You are a legal synthesis specialist. Multiple legal specialists have annotated the same contract clause. Merge their findings into a single coherent summary and, if they suggest alternative language, merge the suggestions into one coherent replacement clause.

Return JSON:
{
  "summary": "1-2 sentence merged summary",
  "suggestedRedline": "merged replacement clause text, or null if no changes suggested"
}

If specialists' suggestions conflict, note the conflict in the summary and present both options in the suggestedRedline.`;

  const userMessage = `ORIGINAL CLAUSE:\n${clauseText}\n\nSPECIALIST ANNOTATIONS:\n${JSON.stringify(annotations, null, 2)}`;

  try {
    const response = await callLLMMaybeWithReasoning(llmClient, {
      context: ctx,
      systemMessage,
      userMessage,
      callerName: `${AGENT_SLUG}:cr-synthesis-merge`,
      temperature: 0.3,
      maxTokens: 1000,
    });

    const parsed = JSON.parse(stripMarkdownFences(response.text)) as {
      summary?: string;
      suggestedRedline?: string | null;
    };
    return {
      summary: parsed.summary ?? annotations.map((a) => a.finding).join(' '),
      suggestedRedline: parsed.suggestedRedline ?? undefined,
    };
  } catch {
    // Fallback: concatenate findings
    return {
      summary: annotations.map((a) => a.finding).join(' '),
      suggestedRedline: annotations.find((a) => a.suggestedLanguage)
        ?.suggestedLanguage,
    };
  }
}
