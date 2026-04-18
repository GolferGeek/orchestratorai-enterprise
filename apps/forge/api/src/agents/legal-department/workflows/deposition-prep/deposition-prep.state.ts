import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type {
  DepositionMode,
  DepositionPrepInput,
} from './deposition-prep.types';

// ── Domain Interfaces ───────────────────────────────────────────────

export interface CaseAnalysisOutput {
  themes: Array<{ id: string; description: string; relevance: string }>;
  inconsistencies: string[];
  legalTheories: string[];
  exhibitCandidates: string[];
}

export interface QuestionSet {
  themeId: string;
  openEnded: Array<{
    question: string;
    strategicPurpose: string;
    expectedWitnessResponse: string;
  }>;
  followUp: Array<{
    question: string;
    strategicPurpose: string;
    expectedWitnessResponse: string;
  }>;
  confrontation: Array<{
    question: string;
    strategicPurpose: string;
    expectedWitnessResponse: string;
  }>;
  trap: Array<{
    question: string;
    strategicPurpose: string;
    expectedWitnessResponse: string;
  }>;
}

export interface DepositionResearchOutput {
  caseStrategies: string[];
  evasionTactics: string[];
  opposingCounselStyle?: string;
}

export interface PreparationOutlineOutput {
  topics: Array<{
    title: string;
    questions: QuestionSet;
  }>;
  exhibitList: Array<{
    name: string;
    timing: string;
    suggestedFollowUp: string;
  }>;
  redFlags: string[];
  fallbackQuestions: string[];
}

export interface OpposingPerspectiveOutput {
  depositionGoals: string[];
  availableDocuments: string[];
  witnessVulnerabilities: string[];
}

export interface PredictedQuestionSet {
  category: 'opening' | 'core-substance' | 'confrontation' | 'trap';
  question: string;
  expectedFollowup?: string;
}

export interface AnswerCoachingOutput {
  [questionIndex: number]: {
    answerFramework: string;
    dangerZones: string[];
    followupHandling: string;
    dontRecallAssessment: 'safe' | 'dangerous' | 'context-dependent';
  };
}

// ── State Annotation ────────────────────────────────────────────────

export const DepositionPrepStateAnnotation = Annotation.Root({
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

  mode: Annotation<DepositionMode>({
    reducer: (_, next) => next,
    default: () => 'preparation-outline',
  }),

  input: Annotation<DepositionPrepInput>({
    reducer: (_, next) => next,
    default: () => ({
      mode: 'preparation-outline',
      caseFacts: '',
      witnessBackground: '',
      depositionTopics: [],
      witnessType: 'fact-witness',
    }),
  }),

  caseAnalysis: Annotation<CaseAnalysisOutput | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  generatedQuestions: Annotation<QuestionSet[] | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  researchFindings: Annotation<DepositionResearchOutput | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  preparationOutline: Annotation<PreparationOutlineOutput | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  opposingPerspective: Annotation<OpposingPerspectiveOutput | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  predictedQuestions: Annotation<PredictedQuestionSet[] | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  answerCoaching: Annotation<AnswerCoachingOutput | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  status: Annotation<'processing' | 'completed' | 'failed'>({
    reducer: (_, next) => next,
    default: () => 'processing',
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
});

export type DepositionPrepState = typeof DepositionPrepStateAnnotation.State;
