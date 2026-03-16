import { Injectable } from '@nestjs/common';

export type TransportKind = 'api' | 'external' | 'llm';

export interface AgentMetricKey {
  kind: TransportKind;
  agentSlug: string;
}

export interface AgentMetricSample {
  success: boolean;
  status: number;
  durationMs: number;
  at: number;
}

export interface AgentMetricSummary {
  total: number;
  failures: number;
  avgMs: number;
  p95Ms: number;
  lastStatus?: number;
}

@Injectable()
export class AgentRuntimeMetricsService {
  private readonly store = new Map<string, AgentMetricSample[]>();

  private keyToString(key: AgentMetricKey): string {
    return `${key.kind}:${key.agentSlug}`;
  }

  record(
    kind: TransportKind,
    agentSlug: string,
    success: boolean,
    durationMs: number,
    status: number,
  ): void {
    const k = this.keyToString({ kind, agentSlug });
    const arr = this.store.get(k) ?? [];
    arr.push({ success, durationMs, status, at: Date.now() });
    // Bound memory: keep last 200 samples per key
    if (arr.length > 200) arr.shift();
    this.store.set(k, arr);
  }

  snapshot(
    kind?: TransportKind,
    agentSlug?: string,
  ): Record<string, AgentMetricSummary> {
    const out: Record<string, AgentMetricSummary> = {};
    for (const [k, samples] of this.store.entries()) {
      if (kind || agentSlug) {
        const [kKind, kSlug] = k.split(':');
        if (kind && kKind !== kind) continue;
        if (agentSlug && kSlug !== agentSlug) continue;
      }
      const total = samples.length;
      const failures = samples.filter((s) => !s.success).length;
      const durations = samples.map((s) => s.durationMs).sort((a, b) => a - b);
      const avgMs =
        durations.reduce((a, b) => a + b, 0) / (durations.length || 1);
      const p95Index = Math.max(0, Math.floor(durations.length * 0.95) - 1);
      const p95Ms = durations.length ? (durations[p95Index] ?? 0) : 0;
      const lastStatus = samples[samples.length - 1]?.status;
      out[k] = { total, failures, avgMs, p95Ms, lastStatus };
    }
    return out;
  }
}
