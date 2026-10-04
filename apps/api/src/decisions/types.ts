/**
 * Wire types for POST /v1/systemone: the decision-model endpoint Ollama serves
 * for Clef and Clef Flash. Hosted Jev speaks the same shape, so moving to it is
 * a base URL, key and model change.
 */

export type Instructions = string | Record<string, unknown> | unknown[];

export interface NoulQuestion {
  type: 'noul';
  instructions: Instructions;
  /** What a yes (near 1) and a no (near 0) mean. Concrete situations beat degrees. */
  criteria?: { true?: string; false?: string };
}

export interface ChoiceQuestion {
  type: 'choice';
  instructions: Instructions;
  /** option -> description (null when the name is self-explanatory). 2-26 options. */
  criteria: Record<string, string | null>;
}

export interface ScoreQuestion {
  type: 'score';
  instructions: Instructions;
  /** Ordered level descriptions, lowest first. 2-26 levels. */
  criteria: string[];
}

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export interface NoulAnswer {
  type: 'noul';
  /** Probability the statement is true. Nouls carry no separate confidence. */
  noul: number;
}

export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  /** How concentrated the probabilities are (0..1), not the chance the answer is right. */
  confidence: number;
}

export interface ScoreAnswer {
  type: 'score';
  /** Probability-weighted position on the level spectrum (0 .. levels-1). */
  score: number;
  probabilities: Record<string, number>;
  confidence: number;
  legend: Record<string, string>;
}

export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export type DecisionState = string | Record<string, unknown> | unknown[];

export interface SystemOneRequest {
  state: DecisionState;
  model: string;
  questions: Record<string, Question>;
  /** Raw base64 PNG, JPEG or WebP, shared by all questions. */
  images?: string[];
}

export interface SystemOneResponse {
  model: string;
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number };
}
