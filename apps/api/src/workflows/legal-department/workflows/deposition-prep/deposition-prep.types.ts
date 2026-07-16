export const DEPOSITION_PREP_JOB_TYPE = 'deposition-prep';
export type DepositionMode = 'preparation-outline' | 'predicted-cross-exam';
export type WitnessType =
  | 'corporate-officer'
  | 'expert-witness'
  | 'fact-witness';

export interface DepositionPrepInput {
  mode: DepositionMode;
  caseFacts: string;
  witnessBackground: string;
  depositionTopics: string[];
  witnessType: WitnessType;
  priorStatements?: string;
  opposingCounselName?: string;
  documents?: Array<{ name: string; content: string; type?: string }>;
}
