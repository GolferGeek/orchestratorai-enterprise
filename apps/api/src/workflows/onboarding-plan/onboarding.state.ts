import type { OnboardingInput } from './onboarding.input';
import { Annotation } from '@langchain/langgraph';
import { runtimeStateChannels } from '../shared/runs';
import type { NewHire } from './hires-store.service';
import type { PolicyFact } from './policy-facts.service';

export interface OnboardingPlan {
  welcome: string;
  firstWeek: Array<{ day: number; items: string[] }>;
  plan30: string[];
  plan60: string[];
  plan90: string[];
}

export interface OnboardingRequest {
  key: string;
  kind: 'account' | 'equipment' | 'access' | 'other';
  item: string;
  owner: string;
  neededBy: string;
  task: { provider: string; id: string } | null;
}

export const OnboardingStateAnnotation = Annotation.Root({
  ...runtimeStateChannels,
  /** What started the run: a recorded hire's id, or the hire to record. */
  input: Annotation<OnboardingInput | null>({ reducer: (_, n) => n, default: () => null }),
  hire: Annotation<NewHire | null>({ reducer: (_, n) => n, default: () => null }),
  policyFacts: Annotation<PolicyFact[]>({ reducer: (_, n) => n, default: () => [] }),
  plan: Annotation<OnboardingPlan | null>({ reducer: (_, n) => n, default: () => null }),
  requests: Annotation<OnboardingRequest[]>({ reducer: (_, n) => n, default: () => [] }),
  reviewRound: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
});

export type OnboardingState = typeof OnboardingStateAnnotation.State;
