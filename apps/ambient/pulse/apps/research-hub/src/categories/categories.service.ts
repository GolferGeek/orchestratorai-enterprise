import { Injectable } from '@nestjs/common';

export interface Category {
  id: string;
  name: string;
  description: string;
  articleCount: number;
  signalStrength: number;
}

@Injectable()
export class CategoriesService {
  private readonly categories: Category[] = [
    {
      id: 'ai-agents',
      name: 'AI Agents',
      description: 'Autonomous AI systems that can plan, reason, and execute multi-step tasks with minimal human oversight. Covers agent architectures, tool use, and emergent capabilities.',
      articleCount: 3,
      signalStrength: 92,
    },
    {
      id: 'payment-protocols',
      name: 'Payment Protocols',
      description: 'Machine-to-machine payment systems enabling autonomous agents to transact, negotiate pricing, and settle payments without human intermediation.',
      articleCount: 2,
      signalStrength: 78,
    },
    {
      id: 'trust-identity',
      name: 'Trust & Identity',
      description: 'Decentralized identity frameworks and trust scoring mechanisms for verifying agent authenticity, capabilities, and reputation in open networks.',
      articleCount: 3,
      signalStrength: 85,
    },
    {
      id: 'multi-agent-systems',
      name: 'Multi-Agent Systems',
      description: 'Architectures for coordinating multiple AI agents to collaborate on complex tasks, including orchestration patterns, communication protocols, and consensus mechanisms.',
      articleCount: 2,
      signalStrength: 88,
    },
    {
      id: 'ai-safety',
      name: 'AI Safety',
      description: 'Research into alignment, containment, and oversight of autonomous AI systems. Covers Constitutional AI, RLHF, interpretability, and governance frameworks.',
      articleCount: 3,
      signalStrength: 95,
    },
  ];

  getAll(): Category[] {
    return this.categories;
  }

  getById(id: string): Category | undefined {
    return this.categories.find((c) => c.id === id);
  }
}
