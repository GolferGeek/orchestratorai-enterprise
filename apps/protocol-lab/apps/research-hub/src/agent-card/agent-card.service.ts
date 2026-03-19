import { Injectable } from '@nestjs/common';
import { AgentCard } from '@agent-communication/shared-types';

@Injectable()
export class AgentCardService {
  private readonly agentCard: AgentCard = {
    id: 'research-hub',
    name: 'ResearchHub',
    description: 'AI Opportunity & Risk research API — serves analysis through personality lenses',
    url: 'http://localhost:6403',
    version: '0.1.0',
    capabilities: [
      {
        id: 'analyze',
        name: 'Analyze Topic',
        description: 'Deep analysis of an AI topic through personality lenses',
      },
      {
        id: 'search',
        name: 'Search Research',
        description: 'Search across research categories and articles',
      },
      {
        id: 'narrative',
        name: 'Get Narrative',
        description: 'Get personality-lens narrative on current trends',
      },
      {
        id: 'signals',
        name: 'Scout Signals',
        description: 'Get emerging signals from the scout watchlist',
      },
    ],
    endpoints: [
      {
        path: '/agent/analyze',
        method: 'POST',
        description: 'Analyze a topic',
        type: 'agent',
        requiresPayment: false,
      },
      {
        path: '/agent/search',
        method: 'POST',
        description: 'Search research',
        type: 'agent',
        requiresPayment: false,
      },
      {
        path: '/agent/narrative/:personality',
        method: 'GET',
        description: 'Get personality narrative',
        type: 'agent',
        requiresPayment: false,
      },
      {
        path: '/agent/signals',
        method: 'GET',
        description: 'Get scout signals',
        type: 'agent',
        requiresPayment: false,
      },
      {
        path: '/api/categories',
        method: 'GET',
        description: 'List research categories',
        type: 'api',
        requiresPayment: false,
      },
      {
        path: '/api/articles',
        method: 'GET',
        description: 'List articles',
        type: 'api',
        requiresPayment: false,
      },
      {
        path: '/api/articles/:id',
        method: 'GET',
        description: 'Get article detail',
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
