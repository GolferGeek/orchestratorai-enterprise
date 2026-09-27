import type { JsonValue } from '@orchestrator-ai/transport-types';
import { b, t, type ExportBlock, type ExportDocument, type ExportSection } from '../shared/export';
import type { ExportSource, WorkflowExporter } from '../shared/export';
import { DECISION_RISK_SLUG, parseDecisionRiskInput } from './decision-risk.handler';
import type { MonteCarloOutcome } from './monte-carlo';

/** A completed run's result, as decisionRiskResult() stored it. */
interface StoredResult {
  overallScore: number;
  overallConfidence: number | null;
  residualScore: number | null;
  executiveSummary: string;
  dimensions: Array<{ slug: string; name: string; score: number; confidence: number; reasoning: string }>;
  debate: { originalScore: number; finalScore: number; adjustment: number } | null;
  mitigations: Array<{ dimensionSlug: string; proposal: string; rationale: string; effort: string; residualScore: number }>;
  monteCarlo: MonteCarloOutcome | null;
}

/** The stored result, checked: a report built from a malformed one would be wrong, not partial. */
export function readStoredResult(result: JsonValue | null): StoredResult {
  const r = result as Partial<StoredResult> | null;
  if (
    !r ||
    typeof r.overallScore !== 'number' ||
    typeof r.executiveSummary !== 'string' ||
    !Array.isArray(r.dimensions) ||
    !Array.isArray(r.mitigations)
  ) {
    throw new Error('This decision-risk run has no complete result to export.');
  }
  return r as StoredResult;
}

const percent = (share: number) => `${Math.round(share * 100)}%`;

/** The decision-risk report: the verdict first, then the evidence for it. */
export function buildDecisionRiskDocument({ run, issues, exportedAt }: ExportSource): ExportDocument {
  const result = readStoredResult(run.result);
  const { proposition, background } = parseDecisionRiskInput(run.input);
  const nameOf = (slug: string) => result.dimensions.find((d) => d.slug === slug)?.name ?? slug;
  const paragraphs = (text: string): ExportBlock[] =>
    text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => ({ kind: 'paragraph', runs: [t(p)] }));

  const sections: ExportSection[] = [
    {
      heading: 'Proposition',
      level: 2,
      blocks: [
        { kind: 'paragraph', runs: [b(proposition)] },
        ...(background ? paragraphs(background) : []),
      ],
    },
    { heading: 'Executive summary', level: 2, blocks: paragraphs(result.executiveSummary) },
    {
      heading: 'Risk by dimension',
      level: 2,
      blocks: [
        {
          kind: 'table',
          headers: ['Dimension', 'Score', 'Confidence'],
          rows: [...result.dimensions]
            .sort((x, y) => y.score - x.score)
            .map((d) => ({ cells: [{ runs: [t(d.name)] }, { runs: [t(String(d.score))] }, { runs: [t(percent(d.confidence))] }] })),
          caption: 'Scores run 0 (no risk) to 100 (severe). Each dimension assessed the proposition independently.',
        },
      ],
    },
  ];

  if (result.debate) {
    sections.push({
      heading: 'Red team',
      level: 2,
      blocks: [
        { kind: 'definition', label: 'Before the challenge', value: String(result.debate.originalScore) },
        { kind: 'definition', label: 'After the challenge', value: String(result.debate.finalScore) },
        { kind: 'definition', label: 'Adjustment', value: `${result.debate.adjustment > 0 ? '+' : ''}${result.debate.adjustment}` },
      ],
    });
  }

  sections.push({
    heading: 'Approved mitigations',
    level: 2,
    blocks: result.mitigations.length
      ? [
          {
            kind: 'numbered',
            items: result.mitigations.map((m) => ({
              primary: [b(`${nameOf(m.dimensionSlug)}: `), t(m.proposal)],
              details: [
                { label: 'Why', value: m.rationale },
                { label: 'Effort', value: m.effort },
                { label: 'Score if done', value: String(m.residualScore) },
              ],
            })),
          },
        ]
      : [{ kind: 'paragraph', runs: [t('No mitigation was approved.')] }],
  });

  if (issues.issues.length) {
    sections.push({
      heading: 'Issues',
      level: 2,
      blocks: [
        {
          kind: 'table',
          headers: ['Severity', 'Status', 'Issue', 'Outcome'],
          rows: issues.issues.map((issue) => ({
            cells: [
              { runs: [t(issue.severity)] },
              { runs: [t(issue.status.replace('_', ' '))] },
              { runs: [t(issue.title)] },
              { runs: [t(issue.lastChange.rationale ?? '')] },
            ],
          })),
        },
      ],
    });
  }

  const composite = result.monteCarlo?.composite;
  if (composite) {
    sections.push({
      heading: 'Uncertainty',
      level: 2,
      blocks: [
        { kind: 'definition', label: '80% interval', value: `${composite.p10} to ${composite.p90}` },
        {
          kind: 'definition',
          label: `Chance of reaching the alert threshold (${composite.alertThreshold})`,
          value: percent(composite.probabilityAboveAlert),
        },
        { kind: 'definition', label: 'Trials', value: composite.trials.toLocaleString('en-US') },
      ],
    });
  }

  return {
    title: 'Decision Risk Assessment',
    generatedAt: exportedAt.toISOString(),
    metadata: [
      { label: 'Composite risk', value: String(result.overallScore) },
      ...(result.residualScore !== null ? [{ label: 'If mitigated', value: String(result.residualScore) }] : []),
      ...(result.overallConfidence !== null ? [{ label: 'Confidence', value: percent(result.overallConfidence) }] : []),
      { label: 'Organization', value: run.organizationSlug },
      { label: 'Run', value: run.id },
      ...(run.completedAt ? [{ label: 'Completed', value: run.completedAt }] : []),
    ],
    sections,
    footer: 'Generated by OrchestratorAI Decision Risk. Model-assisted analysis; verify before relying on it.',
  };
}

/** The proposition as a file-name slug, cut at a word boundary. */
function slugOf(text: string, max = 60): string {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (slug.length <= max) return slug;
  const cut = slug.slice(0, max);
  return cut.slice(0, cut.lastIndexOf('-') > 0 ? cut.lastIndexOf('-') : max);
}

export const decisionRiskExporter: WorkflowExporter = {
  slug: DECISION_RISK_SLUG,
  fileName: ({ run }) => `decision-risk-${slugOf(parseDecisionRiskInput(run.input).proposition)}`,
  build: buildDecisionRiskDocument,
};
