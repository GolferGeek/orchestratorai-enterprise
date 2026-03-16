import { TrustScore } from '@agent-communication/shared-types';
import { ITrustProvider } from '../trust.interface';

interface InteractionRecord {
  success: number;
  failure: number;
  lastInteraction: string;
}

export class ReputationTrustProvider implements ITrustProvider {
  readonly providerId = 'reputation';

  private history: Map<string, InteractionRecord> = new Map();
  private revokedAgents: Set<string> = new Set();

  async evaluateTrust(agentId: string): Promise<TrustScore> {
    if (this.revokedAgents.has(agentId)) {
      return {
        agentId,
        score: 0,
        level: 'untrusted',
        interactions: this.getTotalInteractions(agentId),
        lastInteraction: this.history.get(agentId)?.lastInteraction,
      };
    }

    const record = this.history.get(agentId);
    if (!record) {
      return {
        agentId,
        score: 0.5,
        level: 'neutral',
        interactions: 0,
        lastInteraction: undefined,
      };
    }

    const total = record.success + record.failure;
    const score = total > 0 ? record.success / total : 0.5;
    const level = score > 0.8 ? 'trusted' : score > 0.5 ? 'neutral' : 'untrusted';

    return {
      agentId,
      score,
      level,
      interactions: total,
      lastInteraction: record.lastInteraction,
    };
  }

  async recordInteraction(agentId: string, outcome: 'success' | 'failure'): Promise<void> {
    const existing = this.history.get(agentId) ?? { success: 0, failure: 0, lastInteraction: '' };
    existing[outcome]++;
    existing.lastInteraction = new Date().toISOString();
    this.history.set(agentId, existing);
  }

  async getTrustScore(agentId: string): Promise<TrustScore> {
    return this.evaluateTrust(agentId);
  }

  async revokeTrust(agentId: string): Promise<void> {
    this.revokedAgents.add(agentId);
  }

  private getTotalInteractions(agentId: string): number {
    const record = this.history.get(agentId);
    return record ? record.success + record.failure : 0;
  }
}
