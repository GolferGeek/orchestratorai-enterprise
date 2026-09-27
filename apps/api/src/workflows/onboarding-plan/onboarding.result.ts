import type { JsonValue } from '@orchestrator-ai/transport-types';
import type { NewHire } from './hires-store.service';
import type { OnboardingPlan, OnboardingRequest, OnboardingState } from './onboarding.state';
import type { PolicyFact } from './policy-facts.service';

export interface OnboardingResult {
  hire: NewHire;
  plan: OnboardingPlan;
  requests: OnboardingRequest[];
  policySources: string[];
}

export function onboardingResult(state: OnboardingState): JsonValue {
  if (!state.hire || !state.plan) throw new Error('The onboarding plan finished without the hire or the plan. This is a bug.');
  if (state.requests.some((r) => !r.task)) throw new Error('An approved request has no task. This is a bug.');
  const result: OnboardingResult = { hire: state.hire, plan: state.plan, requests: state.requests, policySources: [...new Set(state.policyFacts.map((f: PolicyFact) => f.source))] };
  return result as unknown as JsonValue;
}
