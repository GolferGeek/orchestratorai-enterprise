import { TrustScore } from '@agent-communication/shared-types';

export interface ITrustProvider {
  readonly providerId: string;

  evaluateTrust(agentId: string): Promise<TrustScore>;
  recordInteraction(agentId: string, outcome: 'success' | 'failure'): Promise<void>;
  getTrustScore(agentId: string): Promise<TrustScore>;
  revokeTrust(agentId: string): Promise<void>;
}
