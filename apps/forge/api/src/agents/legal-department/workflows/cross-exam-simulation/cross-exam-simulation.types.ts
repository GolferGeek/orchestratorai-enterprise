export const CROSS_EXAM_SIMULATION_JOB_TYPE = 'cross-exam-simulation';

export type SimulationMove =
  | 'follow-up'
  | 'new-topic'
  | 'confront-document'
  | 'impeach';

export interface TurnScore {
  turn: number;
  evasion: number; // 0-10
  consistency: number; // 0-10
  damage: number; // 0-10
  coachingNote: string;
}

export interface SimulationQuestion {
  turn: number;
  question: string;
  topic: string;
  move: SimulationMove;
}

export interface SimulationAnswer {
  turn: number;
  answer: string;
  submittedAt: string;
}

export interface SimulationDebrief {
  transcript: Array<{
    question: SimulationQuestion;
    answer: SimulationAnswer;
    score: TurnScore;
  }>;
  weakestMoments: TurnScore[]; // top 5 by damage score
  patterns: string[];
  coachingRecommendations: string[];
  disclaimerText: string;
}

export interface SimulationStrategy {
  topics: string[];
  documentConfrontationMap: Record<string, string>; // document name → confrontation question template
  witnessVulnerabilities: string[];
}

export interface CrossExamSimulationInput {
  caseFacts: string;
  witnessBackground: string;
  priorStatements?: string;
  maxQuestions: number;
  simulationFocus?: string;
  documents?: Array<{ name: string; content: string; type?: string }>;
}
