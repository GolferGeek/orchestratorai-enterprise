import { Injectable } from '@nestjs/common';
import { AgentCard } from '@agent-communication/shared-types';

@Injectable()
export class AgentCardService {
  private readonly agentCard: AgentCard = {
    id: 'market-pulse',
    name: 'MarketPulse',
    description:
      'Market/news scanner and data aggregator — trending topics, feed scanning, article metadata',
    url: `http://localhost:${process.env.PROTOCOL_LAB_MARKET_PULSE_PORT ?? '5404'}`,
    version: '0.1.0',
    capabilities: [
      {
        id: 'scan',
        name: 'Scan Feeds',
        description: 'Scan configured feeds for new articles',
      },
      {
        id: 'trending',
        name: 'Trending Topics',
        description: 'Get currently trending topics across feeds',
      },
      {
        id: 'search',
        name: 'Search News',
        description: 'Search across collected news articles',
      },
    ],
    endpoints: [
      {
        path: '/agent/scan',
        method: 'POST',
        description: 'Scan feeds',
        type: 'agent',
        requiresPayment: false,
      },
      {
        path: '/agent/trending',
        method: 'GET',
        description: 'Get trending topics',
        type: 'agent',
        requiresPayment: false,
      },
      {
        path: '/agent/search',
        method: 'POST',
        description: 'Search news',
        type: 'agent',
        requiresPayment: false,
      },
      {
        path: '/api/feeds',
        method: 'GET',
        description: 'List feed sources',
        type: 'api',
        requiresPayment: false,
      },
      {
        path: '/api/trending',
        method: 'GET',
        description: 'Get trending topics',
        type: 'api',
        requiresPayment: false,
      },
      {
        path: '/api/queue',
        method: 'GET',
        description: 'View article queue',
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

  getCard(): AgentCard {
    return this.agentCard;
  }
}
