import * as crypto from 'crypto';
import { TrustScore } from '@agent-communication/shared-types';
import { ITrustProvider } from '../trust.interface';

interface ChallengeRecord {
  nonce: string;
  issuedAt: string;
}

export class FirstContactTrustProvider implements ITrustProvider {
  readonly providerId = 'first-contact';

  private verifiedAgents: Map<string, { level: 'neutral' | 'trusted'; interactions: number; lastInteraction: string }> = new Map();
  private pendingChallenges: Map<string, ChallengeRecord> = new Map();

  async evaluateTrust(agentId: string): Promise<TrustScore> {
    const verified = this.verifiedAgents.get(agentId);
    if (verified) {
      const score = verified.level === 'trusted' ? 0.9 : 0.5;
      return {
        agentId,
        score,
        level: verified.level,
        interactions: verified.interactions,
        lastInteraction: verified.lastInteraction,
      };
    }

    const nonce = crypto.randomBytes(32).toString('hex');
    this.pendingChallenges.set(agentId, {
      nonce,
      issuedAt: new Date().toISOString(),
    });

    return {
      agentId,
      score: 0,
      level: 'unknown',
      interactions: 0,
      lastInteraction: undefined,
    };
  }

  async recordInteraction(agentId: string, outcome: 'success' | 'failure'): Promise<void> {
    if (outcome === 'success') {
      const existing = this.verifiedAgents.get(agentId);
      if (existing) {
        existing.interactions++;
        existing.lastInteraction = new Date().toISOString();
        if (existing.interactions >= 5) {
          existing.level = 'trusted';
        }
      } else {
        this.pendingChallenges.delete(agentId);
        this.verifiedAgents.set(agentId, {
          level: 'neutral',
          interactions: 1,
          lastInteraction: new Date().toISOString(),
        });
      }
    }
  }

  async getTrustScore(agentId: string): Promise<TrustScore> {
    return this.evaluateTrust(agentId);
  }

  async revokeTrust(agentId: string): Promise<void> {
    this.verifiedAgents.delete(agentId);
    this.pendingChallenges.delete(agentId);
  }
}
