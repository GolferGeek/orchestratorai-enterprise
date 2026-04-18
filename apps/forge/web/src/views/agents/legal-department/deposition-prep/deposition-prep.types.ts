export interface QuestionEntry {
  question: string;
  strategicPurpose: string;
  expectedWitnessResponse: string;
}

export interface QuestionSet {
  themeId: string;
  openEnded: QuestionEntry[];
  followUp: QuestionEntry[];
  confrontation: QuestionEntry[];
  trap: QuestionEntry[];
}

export interface PreparationOutline {
  topics: Array<{ title: string; questions: QuestionSet }>;
  exhibitList: Array<{ name: string; timing: string; suggestedFollowUp: string }>;
  redFlags: string[];
  fallbackQuestions: string[];
}
