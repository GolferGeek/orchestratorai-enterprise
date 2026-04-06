import { Injectable } from '@nestjs/common';
import { AgentCard } from '@agent-communication/shared-types';

@Injectable()
export class AgentCardService {
  private readonly agentCard: AgentCard = {
    id: 'agent-consumer',
    name: 'AgentConsumer',
    description: 'A pure JSON consumer of ResearchHub — discovers and exercises every ResearchHub capability via Accept: application/json',
    url: `http://localhost:${process.env.PROTOCOL_LAB_AGENT_CONSUMER_PORT ?? '5406'}`,
    version: '0.1.0',
    capabilities: [
      {
        id: 'discover',
        name: 'Discover ResearchHub',
        description: 'Fetch and return the ResearchHub agent card via .well-known/agent.json',
      },
      {
        id: 'explore-articles',
        name: 'Explore Articles',
        description: 'Fetch articles from ResearchHub with optional query and category filters',
      },
      {
        id: 'explore-categories',
        name: 'Explore Categories',
        description: 'Fetch all research categories from ResearchHub',
      },
      {
        id: 'explore-signals',
        name: 'Explore Signals',
        description: 'Fetch scout watchlist signals from ResearchHub with optional category filter',
      },
      {
        id: 'explore-narratives',
        name: 'Explore Narratives',
        description: 'Fetch personality-lens narrative from ResearchHub',
      },
      {
        id: 'analyze-topic',
        name: 'Analyze Topic',
        description: 'Submit a topic for deep analysis through ResearchHub personality lenses',
      },
    ],
    endpoints: [
      {
        path: '/api/explore/discovery',
        method: 'GET',
        description: 'Fetch ResearchHub agent card',
        type: 'api',
        requiresPayment: false,
      },
      {
        path: '/api/explore/categories',
        method: 'GET',
        description: 'Fetch all ResearchHub categories',
        type: 'api',
        requiresPayment: false,
      },
      {
        path: '/api/explore/articles',
        method: 'GET',
        description: 'Fetch ResearchHub articles (supports ?q= and ?category=)',
        type: 'api',
        requiresPayment: false,
      },
      {
        path: '/api/explore/articles/:id',
        method: 'GET',
        description: 'Fetch a single ResearchHub article by id',
        type: 'api',
        requiresPayment: false,
      },
      {
        path: '/api/explore/signals',
        method: 'GET',
        description: 'Fetch ResearchHub scout signals (supports ?category=)',
        type: 'api',
        requiresPayment: false,
      },
      {
        path: '/api/explore/narratives/:personality',
        method: 'GET',
        description: 'Fetch a ResearchHub personality narrative',
        type: 'agent',
        requiresPayment: false,
      },
      {
        path: '/api/explore/analyze',
        method: 'POST',
        description: 'Analyze a topic through ResearchHub',
        type: 'agent',
        requiresPayment: false,
      },
      {
        path: '/api/explore/search',
        method: 'POST',
        description: 'Search ResearchHub content',
        type: 'agent',
        requiresPayment: false,
      },
      {
        path: '/api/explore/full-demo',
        method: 'GET',
        description: 'Call all ResearchHub endpoints in sequence and return combined results',
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
