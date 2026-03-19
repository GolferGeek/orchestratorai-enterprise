import { createVerify } from 'crypto';
import { TrustScore } from '@agent-communication/shared-types';
import { ITrustProvider } from '../trust.interface';

type TrustOutcome = 'success' | 'failure';

interface TrustRecord {
  successes: number;
  failures: number;
  lastInteraction?: string;
}

interface SignedAgentCardPayload {
  card: Record<string, unknown>;
  signature: string;
}

export class A2AJwsTrustProvider implements ITrustProvider {
  readonly providerId = 'a2a-jws-trust';

  private interactions: Map<string, TrustRecord> = new Map();
  private revokedAgents: Set<string> = new Set();

  async evaluateTrust(agentId: string): Promise<TrustScore> {
    const record = this.interactions.get(agentId);
    const interactionCount = record ? record.successes + record.failures : 0;

    if (this.revokedAgents.has(agentId)) {
      return {
        agentId,
        score: 0,
        level: 'untrusted',
        interactions: interactionCount,
        lastInteraction: record?.lastInteraction,
      };
    }

    if (!record) {
      return {
        agentId,
        score: 0.5,
        level: 'neutral',
        interactions: 0,
      };
    }

    const score =
      interactionCount === 0 ? 0.5 : record.successes / interactionCount;
    const level = score >= 0.85 ? 'trusted' : score >= 0.5 ? 'neutral' : 'untrusted';

    return {
      agentId,
      score,
      level,
      interactions: interactionCount,
      lastInteraction: record.lastInteraction,
    };
  }

  async recordInteraction(agentId: string, outcome: TrustOutcome): Promise<void> {
    const existing = this.interactions.get(agentId) ?? { successes: 0, failures: 0 };
    if (outcome === 'success') {
      existing.successes += 1;
    } else {
      existing.failures += 1;
    }
    existing.lastInteraction = new Date().toISOString();
    this.interactions.set(agentId, existing);
  }

  async getTrustScore(agentId: string): Promise<TrustScore> {
    return this.evaluateTrust(agentId);
  }

  async revokeTrust(agentId: string): Promise<void> {
    this.revokedAgents.add(agentId);
  }

  verifySignedAgentCard(payload: SignedAgentCardPayload, publicKeyPem: string): boolean {
    const canonical = canonicalizeJson(payload.card);
    const verifier = createVerify('RSA-SHA256');
    verifier.update(canonical);
    verifier.end();
    try {
      return verifier.verify(publicKeyPem, payload.signature, 'base64url');
    } catch {
      return false;
    }
  }

  validateTlsVersion(version: string): boolean {
    const normalized = version.trim().toUpperCase();
    return normalized === 'TLS1.2' || normalized === 'TLS1.3' || normalized === 'TLSV1.2' || normalized === 'TLSV1.3';
  }
}

function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const serialized = entries.map(([key, val]) => `${JSON.stringify(key)}:${canonicalizeJson(val)}`);
  return `{${serialized.join(',')}}`;
}
