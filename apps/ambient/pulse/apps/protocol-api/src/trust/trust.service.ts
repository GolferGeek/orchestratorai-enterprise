import { Injectable, Logger } from '@nestjs/common';

export interface TrustInfo {
  agentId: string;
  score: number;
  level: 'trusted' | 'neutral' | 'untrusted' | 'unknown';
  interactions: number;
  lastInteraction?: string;
  provider: string;
}

@Injectable()
export class TrustService {
  private readonly logger = new Logger(TrustService.name);

  private trustScores: Map<string, TrustInfo> = new Map([
    [
      'research-hub',
      {
        agentId: 'research-hub',
        score: 92,
        level: 'trusted',
        interactions: 47,
        lastInteraction: '2026-03-09T12:30:00Z',
        provider: 'allowlist',
      },
    ],
    [
      'market-pulse',
      {
        agentId: 'market-pulse',
        score: 85,
        level: 'trusted',
        interactions: 31,
        lastInteraction: '2026-03-09T12:15:00Z',
        provider: 'allowlist',
      },
    ],
    [
      'content-forge',
      {
        agentId: 'content-forge',
        score: 50,
        level: 'neutral',
        interactions: 0,
        provider: 'first-contact',
      },
    ],
  ]);

  getAllTrustScores(): TrustInfo[] {
    return Array.from(this.trustScores.values());
  }

  getTrustScore(agentId: string): TrustInfo {
    const existing = this.trustScores.get(agentId);
    if (existing) return { ...existing };

    // Unknown agent
    return {
      agentId,
      score: 0,
      level: 'unknown',
      interactions: 0,
      provider: 'allowlist',
    };
  }

  updateTrustProvider(agentId: string, provider: string): TrustInfo {
    const existing = this.trustScores.get(agentId);
    if (existing) {
      existing.provider = provider;
      this.logger.log(`Trust provider for ${agentId} updated to: ${provider}`);
      return { ...existing };
    }
    const newScore: TrustInfo = {
      agentId,
      score: 0,
      level: 'unknown',
      interactions: 0,
      provider,
    };
    this.trustScores.set(agentId, newScore);
    return { ...newScore };
  }
}
