/**
 * Adversarial Brief Stress-Testing — State Annotation.
 *
 * Separate state from the document-analysis, contract-review, and legal-research
 * workflows because the adversarial-brief workflow has fundamentally different
 * state needs: Blue/Red team outputs per round, judge scoring, convergence
 * detection, and fortification tracking.
 *
 * See: docs/efforts/current/adversarial-brief-stress-testing/prd.md §4.1
 */
import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { LegalDocumentMetadata } from '../../legal-department.state';

// ── Domain Interfaces ───────────────────────────────────────────────

/** A single argument extracted from the brief. */
export interface BriefArgument {
  id: string;
  claim: string;
  support: string;
  citations: string[];
}

/** A single citation extracted from the brief. */
export interface BriefCitation {
  id: string;
  text: string;
  source: string;
  verified: boolean;
}

/** A single factual assertion extracted from the brief. */
export interface FactualAssertion {
  id: string;
  assertion: string;
  support: string;
}

/** Structured representation of the brief's content. */
export interface BriefStructure {
  arguments: BriefArgument[];
  citations: BriefCitation[];
  factualAssertions: FactualAssertion[];
}

/** A single defense entry from a Blue Team agent. */
export interface DefenseEntry {
  agentRole: 'argument-defender' | 'authority-defender' | 'facts-defender';
  targetId: string;
  defense: string;
  confidence: number;
  supportingAuthority?: string[];
}

/** Blue Team output for a single round. */
export interface BlueTeamOutput {
  defenses: DefenseEntry[];
  summary: string;
}

/** A single attack entry from a Red Team agent. */
export interface AttackEntry {
  id: string;
  agentRole: 'counter-argument' | 'distinguishing-cases' | 'factual-challenge';
  targetId: string;
  attack: string;
  severity: number;
  category: 'argument' | 'citation' | 'factual';
  counterAuthority?: string[];
  strippedCitations?: string[];
}

/** Red Team output for a single round. */
export interface RedTeamOutput {
  attacks: AttackEntry[];
  summary: string;
}

/** Score for a single dimension of the judge's rubric. */
export interface RubricScore {
  legalSoundness: number;
  factualSupport: number;
  citationQuality: number;
  persuasiveness: number;
}

/** Judge's assessment of a single argument exchange. */
export interface ArgumentExchangeScore {
  argumentId: string;
  blueScore: RubricScore;
  redScore: RubricScore;
  overallSeverity: number;
  assessment: string;
}

/** Judge's scoring for an entire round. */
export interface JudgeScoring {
  round: number;
  exchanges: ArgumentExchangeScore[];
  roundSummary: string;
  highestSeverity: number;
  positionOrder: 'blue-first' | 'red-first';
}

/** A complete debate round: Blue defense + Red attack + Judge scoring. */
export interface DebateRound {
  round: number;
  blueTeamArguments: BlueTeamOutput;
  redTeamAttacks: RedTeamOutput;
  judgeScoring?: JudgeScoring;
}

/** A ranked attack in the stress-test report. */
export interface RankedAttack {
  id: string;
  severity: number;
  category: 'argument' | 'citation' | 'factual';
  description: string;
  briefSection: string;
  redTeamReasoning: string;
  blueTeamRebuttal: string;
  judgeAssessment: string;
  recommendation: string;
}

/** A weak citation identified in the stress-test report. */
export interface WeakCitation {
  id: string;
  originalCitation: string;
  weakness: string;
  suggestedReplacement: string | null;
}

/** A factual gap identified in the stress-test report. */
export interface FactualGap {
  id: string;
  assertion: string;
  gap: string;
  suggestedEvidence: string;
}

/** Summary statistics for the stress-test. */
export interface StressTestSummary {
  totalRounds: number;
  convergenceReason: string;
  overallStrength: number;
  criticalWeaknesses: number;
  moderateWeaknesses: number;
  minorWeaknesses: number;
}

/** The full stress-test report produced by synthesis. */
export interface StressTestReport {
  attacks: RankedAttack[];
  weakCitations: WeakCitation[];
  factualGaps: FactualGap[];
  summary: StressTestSummary;
}

/** HITL decision payload for adversarial brief review. */
export interface AdversarialHitlDecision {
  type:
    | 'approve-and-fortify'
    | 'approve-without-fortification'
    | 'reject-and-rerun';
  acceptedRecommendations?: string[];
  guidance?: string;
}

// ── State Annotation ────────────────────────────────────────────────

export const AdversarialBriefStateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,

  executionContext: Annotation<ExecutionContext>({
    reducer: (_, next) => next,
    default: () => ({
      orgSlug: '',
      userId: '',
      conversationId: '',
      agentSlug: '',
      agentType: '',
      provider: '',
      model: '',
    }),
  }),

  userMessage: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  documents: Annotation<
    Array<{ name: string; content: string; type?: string }>
  >({
    reducer: (_, next) => next,
    default: () => [],
  }),

  documentsMetadata: Annotation<LegalDocumentMetadata[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // Brief analysis
  briefStructure: Annotation<BriefStructure | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Debate configuration
  currentRound: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  maxRounds: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 5,
  }),

  severityThreshold: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 7,
  }),

  // Round history
  rounds: Annotation<DebateRound[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // Current round team outputs
  blueTeamOutput: Annotation<BlueTeamOutput | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  redTeamOutput: Annotation<RedTeamOutput | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  judgeOutput: Annotation<JudgeScoring | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Convergence
  converged: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),

  convergenceReason: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Synthesis
  stressTestReport: Annotation<StressTestReport | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // HITL
  hitlDecision: Annotation<AdversarialHitlDecision | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  acceptedFortifications: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // Fortified brief
  fortifiedBrief: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Standard workflow fields
  report: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  status: Annotation<'started' | 'processing' | 'completed' | 'failed'>({
    reducer: (_, next) => next,
    default: () => 'started',
  }),

  error: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  startedAt: Annotation<number>({
    reducer: (_, next) => next,
    default: () => Date.now(),
  }),

  completedAt: Annotation<number | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  tokenUsage: Annotation<{ input: number; output: number }>({
    reducer: (_, next) => next,
    default: () => ({ input: 0, output: 0 }),
  }),
});

export type AdversarialBriefState =
  typeof AdversarialBriefStateAnnotation.State;
