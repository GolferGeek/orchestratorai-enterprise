import { Injectable } from '@nestjs/common';
import { AgentCard } from '@agent-communication/shared-types';

@Injectable()
export class AgentCardService {
  private readonly agentCard: AgentCard = {
    id: 'content-forge',
    name: 'ContentForge',
    description: 'AI-powered content drafting from research and market intelligence',
    url: `http://localhost:${process.env.PROTOCOL_LAB_CONTENT_FORGE_PORT ?? '5405'}`,
    version: '0.1.0',
    capabilities: [
      {
        id: 'draft-generation',
        name: 'Draft Generation',
        description: 'Generate blog posts and articles from research data',
      },
      {
        id: 'topic-suggestion',
        name: 'Topic Suggestion',
        description: 'Suggest relevant topics based on trends and research',
      },
      {
        id: 'multi-source-synthesis',
        name: 'Multi-Source Synthesis',
        description: 'Synthesize content from multiple agent sources',
      },
    ],
    endpoints: [
      {
        path: '/agent/draft',
        method: 'POST',
        description: 'Generate content draft',
        type: 'agent',
        requiresPayment: false,
      },
      {
        path: '/agent/suggest-topics',
        method: 'GET',
        description: 'Get topic suggestions',
        type: 'agent',
        requiresPayment: false,
      },
      {
        path: '/agent/sources',
        method: 'GET',
        description: 'List data sources',
        type: 'agent',
        requiresPayment: false,
      },
      {
        path: '/api/drafts',
        method: 'GET',
        description: 'List all drafts',
        type: 'api',
        requiresPayment: false,
      },
      {
        path: '/api/drafts/:id',
        method: 'GET',
        description: 'Get draft detail',
        type: 'api',
        requiresPayment: false,
      },
      {
        path: '/api/topics',
        method: 'GET',
        description: 'List topic suggestions',
        type: 'api',
        requiresPayment: false,
      },
      {
        path: '/api/workflow/execute',
        method: 'POST',
        description: 'Execute content pipeline',
        type: 'api',
        requiresPayment: false,
      },
    ],
    protocols: {
      discovery: ['well-known'],
      transport: ['http-rest'],
      negotiation: ['capability-card'],
      identity: ['local-keys'],
      payment: ['mock'],
      wallet: ['local-keypair'],
      trust: ['allowlist'],
      encryption: ['none'],
      resilience: ['retry'],
      observability: ['file-log'],
      orchestration: ['pipeline'],
    },
  };

  getAgentCard(): AgentCard {
    return this.agentCard;
  }
}
