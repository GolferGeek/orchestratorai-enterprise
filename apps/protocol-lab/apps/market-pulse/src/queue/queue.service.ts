import { Injectable } from '@nestjs/common';

export interface QueueArticle {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  queuedAt: string;
  status: 'pending' | 'sent' | 'analyzed' | 'failed';
  relevanceScore: number;
  summary: string;
}

@Injectable()
export class QueueService {
  private articles: QueueArticle[] = [
    {
      id: 'article-001',
      title: 'OpenAI Announces Multi-Agent Framework for Enterprise',
      source: 'TechCrunch AI',
      url: 'https://techcrunch.com/2026/03/09/openai-multi-agent-framework',
      publishedAt: '2026-03-09T06:00:00Z',
      queuedAt: '2026-03-09T06:15:00Z',
      status: 'pending',
      relevanceScore: 0.94,
      summary: 'OpenAI releases a new framework enabling enterprise customers to deploy multi-agent systems with built-in A2A communication.',
    },
    {
      id: 'article-002',
      title: 'Anthropic Claude 4 Sets New Coding Benchmark Records',
      source: 'AI News Daily',
      url: 'https://ainewsdaily.com/2026/03/09/claude-4-benchmarks',
      publishedAt: '2026-03-09T05:30:00Z',
      queuedAt: '2026-03-09T05:45:00Z',
      status: 'sent',
      relevanceScore: 0.91,
      summary: 'Claude 4 achieves state-of-the-art results on SWE-bench and HumanEval, outperforming competitors in autonomous coding tasks.',
    },
    {
      id: 'article-003',
      title: 'Bitcoin Breaks $120K as Institutional Adoption Accelerates',
      source: 'CoinDesk',
      url: 'https://coindesk.com/2026/03/09/bitcoin-120k-institutional',
      publishedAt: '2026-03-09T04:00:00Z',
      queuedAt: '2026-03-09T04:10:00Z',
      status: 'analyzed',
      relevanceScore: 0.87,
      summary: 'Bitcoin surpasses $120,000 as major pension funds and sovereign wealth funds increase allocations to crypto assets.',
    },
    {
      id: 'article-004',
      title: 'Google DeepMind Unveils Gemini Ultra 2.0 with Agentic Capabilities',
      source: 'TechCrunch AI',
      url: 'https://techcrunch.com/2026/03/08/gemini-ultra-2-agentic',
      publishedAt: '2026-03-08T18:00:00Z',
      queuedAt: '2026-03-08T18:20:00Z',
      status: 'sent',
      relevanceScore: 0.89,
      summary: 'Gemini Ultra 2.0 introduces native tool use and multi-step reasoning for autonomous agent workflows.',
    },
    {
      id: 'article-005',
      title: 'EU AI Act: First Enforcement Actions Target Foundation Model Providers',
      source: 'The Information',
      url: 'https://theinformation.com/2026/03/08/eu-ai-act-enforcement',
      publishedAt: '2026-03-08T14:00:00Z',
      queuedAt: '2026-03-08T14:30:00Z',
      status: 'pending',
      relevanceScore: 0.83,
      summary: 'European regulators issue first compliance notices under the AI Act, targeting transparency requirements for frontier models.',
    },
    {
      id: 'article-006',
      title: 'Open Source Llama 4 Matches Proprietary Models on Reasoning',
      source: 'AI News Daily',
      url: 'https://ainewsdaily.com/2026/03/08/llama-4-reasoning',
      publishedAt: '2026-03-08T12:00:00Z',
      queuedAt: '2026-03-08T12:15:00Z',
      status: 'analyzed',
      relevanceScore: 0.85,
      summary: 'Meta releases Llama 4, which demonstrates competitive performance with GPT-5 and Claude 4 on mathematical reasoning benchmarks.',
    },
    {
      id: 'article-007',
      title: 'Nvidia Reports Record Data Center Revenue on AI Demand',
      source: 'CoinDesk',
      url: 'https://coindesk.com/2026/03/08/nvidia-data-center-revenue',
      publishedAt: '2026-03-08T10:00:00Z',
      queuedAt: '2026-03-08T10:05:00Z',
      status: 'failed',
      relevanceScore: 0.72,
      summary: 'Nvidia Q4 data center revenue exceeds $40B as Blackwell GPU shipments ramp to meet insatiable AI training demand.',
    },
    {
      id: 'article-008',
      title: 'AI Drug Discovery Startup Raises $2B to Accelerate Clinical Trials',
      source: 'TechCrunch AI',
      url: 'https://techcrunch.com/2026/03/07/ai-drug-discovery-2b-raise',
      publishedAt: '2026-03-07T16:00:00Z',
      queuedAt: '2026-03-07T16:30:00Z',
      status: 'sent',
      relevanceScore: 0.78,
      summary: 'Isomorphic Labs secures $2B Series C to expand AI-driven drug candidate identification and clinical trial optimization.',
    },
    {
      id: 'article-009',
      title: 'Agent Communication Standards Body Publishes Draft Protocol Spec',
      source: 'AI News Daily',
      url: 'https://ainewsdaily.com/2026/03/07/agent-comm-protocol-spec',
      publishedAt: '2026-03-07T11:00:00Z',
      queuedAt: '2026-03-07T11:20:00Z',
      status: 'pending',
      relevanceScore: 0.96,
      summary: 'A new industry consortium publishes v0.1 of a standardized agent-to-agent communication protocol covering discovery, negotiation, and trust.',
    },
    {
      id: 'article-010',
      title: 'Autonomous Coding Agents Ship First Production Features at Scale',
      source: 'The Information',
      url: 'https://theinformation.com/2026/03/07/autonomous-coding-production',
      publishedAt: '2026-03-07T09:00:00Z',
      queuedAt: '2026-03-07T09:10:00Z',
      status: 'analyzed',
      relevanceScore: 0.90,
      summary: 'Multiple tech companies report that AI coding agents are now autonomously shipping production features with minimal human review.',
    },
  ];

  findAll(): QueueArticle[] {
    return this.articles.sort(
      (a, b) =>
        new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime(),
    );
  }

  findById(id: string): QueueArticle | undefined {
    return this.articles.find((a) => a.id === id);
  }

  send(id: string): QueueArticle {
    const article = this.articles.find((a) => a.id === id);
    if (!article) {
      throw new Error(`Article ${id} not found in queue`);
    }
    if (article.status !== 'pending') {
      throw new Error(
        `Article ${id} cannot be sent — current status: ${article.status}`,
      );
    }
    article.status = 'sent';
    return article;
  }
}
