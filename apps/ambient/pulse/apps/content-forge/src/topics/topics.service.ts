import { Injectable, NotFoundException } from '@nestjs/common';

export interface TopicSuggestion {
  id: string;
  title: string;
  category: string;
  relevanceScore: number;
  sources: string[];
  createdAt: string;
}

@Injectable()
export class TopicsService {
  private readonly topics: TopicSuggestion[] = [
    {
      id: 'topic-001',
      title: 'Agent-to-Agent Payment Settlement Mechanisms',
      category: 'payment-protocols',
      relevanceScore: 0.94,
      sources: ['research-hub', 'market-pulse'],
      createdAt: '2026-03-08T10:00:00Z',
    },
    {
      id: 'topic-002',
      title: 'Prompt Injection Defenses in Multi-Agent Systems',
      category: 'ai-safety',
      relevanceScore: 0.92,
      sources: ['research-hub'],
      createdAt: '2026-03-07T14:00:00Z',
    },
    {
      id: 'topic-003',
      title: 'The Economics of Micro-Agent Composition',
      category: 'multi-agent-systems',
      relevanceScore: 0.89,
      sources: ['market-pulse', 'research-hub'],
      createdAt: '2026-03-07T09:00:00Z',
    },
    {
      id: 'topic-004',
      title: 'Decentralized Identity for Autonomous Agents',
      category: 'trust-identity',
      relevanceScore: 0.87,
      sources: ['research-hub'],
      createdAt: '2026-03-06T16:00:00Z',
    },
    {
      id: 'topic-005',
      title: 'GPU Compute Market Dynamics for Agent Inference',
      category: 'infrastructure',
      relevanceScore: 0.85,
      sources: ['market-pulse'],
      createdAt: '2026-03-06T11:00:00Z',
    },
    {
      id: 'topic-006',
      title: 'Capability Card Standardization Progress',
      category: 'multi-agent-systems',
      relevanceScore: 0.83,
      sources: ['research-hub', 'market-pulse'],
      createdAt: '2026-03-05T15:00:00Z',
    },
    {
      id: 'topic-007',
      title: 'Agent Sandboxing and Containment Architectures',
      category: 'ai-safety',
      relevanceScore: 0.81,
      sources: ['research-hub'],
      createdAt: '2026-03-05T08:00:00Z',
    },
    {
      id: 'topic-008',
      title: 'Enterprise Adoption Patterns for Agent Workflows',
      category: 'infrastructure',
      relevanceScore: 0.78,
      sources: ['market-pulse', 'research-hub'],
      createdAt: '2026-03-04T12:00:00Z',
    },
  ];

  getAll(): TopicSuggestion[] {
    return this.topics;
  }

  getById(id: string): TopicSuggestion {
    const topic = this.topics.find((t) => t.id === id);
    if (!topic) {
      throw new NotFoundException(`Topic "${id}" not found`);
    }
    return topic;
  }

  getByCategory(category: string): TopicSuggestion[] {
    return this.topics.filter((t) => t.category === category);
  }
}
