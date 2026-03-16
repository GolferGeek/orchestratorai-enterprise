import { Injectable } from '@nestjs/common';

export interface ScoutSignal {
  id: string;
  title: string;
  description: string;
  signalStrength: number;
  category: string;
  detectedAt: string;
  recommendedAction: string;
  source: string;
}

@Injectable()
export class ScoutService {
  private readonly signals: ScoutSignal[] = [
    {
      id: 'sig-001',
      title: 'A2A Protocol Standardization Acceleration',
      description: 'Google, Anthropic, and OpenAI working groups are converging faster than expected on a unified agent communication standard. Draft specification expected within 8 weeks.',
      signalStrength: 94,
      category: 'multi-agent-systems',
      detectedAt: '2026-03-08T14:30:00.000Z',
      recommendedAction: 'Begin implementing the shared primitives (capability cards, message envelopes, .well-known discovery) to ensure compatibility with the emerging standard.',
      source: 'Working group publications and commit activity analysis',
    },
    {
      id: 'sig-002',
      title: 'Agent-to-Agent Payment Volume Spike',
      description: 'Micropayment transaction volume between AI agents increased 340% month-over-month across three major payment rail providers.',
      signalStrength: 87,
      category: 'payment-protocols',
      detectedAt: '2026-03-07T09:15:00.000Z',
      recommendedAction: 'Evaluate payment protocol integration for your agent services. The window for establishing payment infrastructure before market saturation is narrowing.',
      source: 'Payment rail provider public dashboards and API traffic analysis',
    },
    {
      id: 'sig-003',
      title: 'Novel Prompt Injection Vector via Agent Protocols',
      description: 'Academic researchers published a pre-print demonstrating a new class of prompt injection attacks that exploit capability negotiation messages to inject instructions.',
      signalStrength: 91,
      category: 'ai-safety',
      detectedAt: '2026-03-06T22:00:00.000Z',
      recommendedAction: 'Audit all agent-to-agent message parsing code. Implement strict separation between protocol metadata and content payloads. Never feed raw agent messages into LLM context without sanitization.',
      source: 'ArXiv pre-print and security advisory from CERT coordination center',
    },
    {
      id: 'sig-004',
      title: 'Enterprise Agent Adoption Crosses 50% Threshold',
      description: 'Survey data indicates that over 50% of Fortune 500 companies now have at least one production agent-based workflow, up from 12% six months ago.',
      signalStrength: 78,
      category: 'ai-agents',
      detectedAt: '2026-03-05T16:45:00.000Z',
      recommendedAction: 'The market is transitioning from early adopter to early majority. Focus on reliability, observability, and enterprise security features rather than novel capabilities.',
      source: 'Industry survey data cross-referenced with job posting analysis',
    },
    {
      id: 'sig-005',
      title: 'Decentralized Agent Identity Standard Gains Traction',
      description: 'The W3C Agent DID method specification received 15 new implementer commitments this week, including two major cloud providers.',
      signalStrength: 82,
      category: 'trust-identity',
      detectedAt: '2026-03-04T11:20:00.000Z',
      recommendedAction: 'Begin prototyping DID-based agent identity in non-production environments. The standard is stabilizing and early implementation experience will be valuable when it becomes required.',
      source: 'W3C working group minutes and GitHub repository activity',
    },
  ];

  getWatchlist(): ScoutSignal[] {
    return this.signals.sort((a, b) => b.signalStrength - a.signalStrength);
  }

  getByCategory(category: string): ScoutSignal[] {
    return this.signals
      .filter((s) => s.category === category)
      .sort((a, b) => b.signalStrength - a.signalStrength);
  }
}
