import { TrustScore } from '@agent-communication/shared-types';
import { ITrustProvider } from '../trust.interface';

export class AllowlistTrustProvider implements ITrustProvider {
  readonly providerId = 'allowlist';

  private allowedAgents: Set<string> = new Set();
  private interactions: Map<string, { success: number; failure: number }> = new Map();

  addToAllowlist(agentId: string): void {
    this.allowedAgents.add(agentId);
  }

  removeFromAllowlist(agentId: string): void {
    this.allowedAgents.delete(agentId);
  }

  async evaluateTrust(agentId: string): Promise<TrustScore> {
    const trusted = this.allowedAgents.has(agentId);
    const record = this.interactions.get(agentId);
    return {
      agentId,
      score: trusted ? 1.0 : 0.0,
      level: trusted ? 'trusted' : 'untrusted',
      interactions: record ? record.success + record.failure : 0,
      lastInteraction: undefined,
    };
  }

  async recordInteraction(agentId: string, outcome: 'success' | 'failure'): Promise<void> {
    const existing = this.interactions.get(agentId) ?? { success: 0, failure: 0 };
    existing[outcome]++;
    this.interactions.set(agentId, existing);
  }

  async getTrustScore(agentId: string): Promise<TrustScore> {
    return this.evaluateTrust(agentId);
  }

  async revokeTrust(agentId: string): Promise<void> {
    this.allowedAgents.delete(agentId);
  }
}
