import { Injectable, NotFoundException } from '@nestjs/common';

export interface DraftSource {
  agentId: string;
  dataType: string;
}

export interface Draft {
  id: string;
  title: string;
  status: 'draft' | 'review' | 'published';
  content: string;
  sources: DraftSource[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateDraftDto {
  title: string;
  content: string;
  sources?: DraftSource[];
}

export interface UpdateDraftDto {
  title?: string;
  content?: string;
  status?: 'draft' | 'review' | 'published';
  sources?: DraftSource[];
}

@Injectable()
export class DraftsService {
  private drafts: Draft[] = [
    {
      id: 'draft-001',
      title: 'The Rise of Agent-to-Agent Commerce',
      status: 'published',
      content: `Agent-to-agent commerce is rapidly emerging as a transformative force in the AI ecosystem. As autonomous agents become more capable, they increasingly need to transact with each other to accomplish complex tasks. This shift represents a fundamental change in how software systems interact — moving from rigid API contracts to dynamic, negotiated exchanges.\n\nThe key enablers of this trend include standardized capability cards that allow agents to advertise their services, micropayment rails that support sub-cent transactions with millisecond settlement times, and trust frameworks that let agents evaluate potential collaborators. Early adopters report that agent commerce reduces integration costs by up to 40% compared to traditional API marketplace models.\n\nHowever, significant challenges remain. Price discovery in agent markets is still primitive, with most systems relying on fixed-rate pricing rather than dynamic negotiation. Security concerns around prompt injection through agent communication channels have yet to be fully addressed. And the regulatory framework for autonomous agent transactions is virtually nonexistent.\n\nDespite these hurdles, the trajectory is clear: by late 2026, agent-to-agent commerce is expected to represent a significant portion of B2B software interactions, fundamentally reshaping how digital services are discovered, negotiated, and consumed.`,
      sources: [
        { agentId: 'research-hub', dataType: 'narrative' },
        { agentId: 'market-pulse', dataType: 'trend-data' },
      ],
      createdAt: '2026-03-01T10:00:00Z',
      updatedAt: '2026-03-05T14:30:00Z',
    },
    {
      id: 'draft-002',
      title: 'Multi-Agent Orchestration Patterns in Production',
      status: 'review',
      content: `Production multi-agent systems are converging on three dominant orchestration patterns, each suited to different use cases. Understanding when to apply each pattern is critical for building reliable agent workflows.\n\nThe pipeline pattern chains agents sequentially, where each agent processes and enriches the output of the previous one. This works well for content generation workflows: a research agent gathers data, an analysis agent identifies key themes, and a writing agent produces the final output. Pipelines are simple to reason about and debug, but they create bottlenecks at slow stages.\n\nHub-and-spoke orchestration uses a central coordinator to dispatch subtasks to specialized agents and aggregate their results. This pattern excels for research and analysis tasks where multiple perspectives are needed simultaneously. The coordinator manages parallelism, handles failures, and synthesizes diverse outputs into coherent results.\n\nAutonomous swarm orchestration allows agents to self-organize around a shared objective. While promising for exploration tasks, swarms remain largely experimental in production settings due to the difficulty of maintaining behavioral guarantees when agents interact without central coordination.\n\nMost production systems today use pipeline or hub-and-spoke patterns, often combining both within a single workflow.`,
      sources: [
        { agentId: 'research-hub', dataType: 'article' },
        { agentId: 'research-hub', dataType: 'narrative' },
      ],
      createdAt: '2026-03-03T09:00:00Z',
      updatedAt: '2026-03-07T11:15:00Z',
    },
    {
      id: 'draft-003',
      title: 'Trust Scoring: The Currency of the Agent Economy',
      status: 'draft',
      content: `In an economy where autonomous agents transact with each other, trust becomes the fundamental currency. Without trust scoring, agents have no reliable way to evaluate whether a potential collaborator will deliver quality results, maintain data confidentiality, or honor payment agreements.\n\nThe emerging standard for agent trust uses a multi-dimensional vector capturing four key attributes. Response quality measures the accuracy and usefulness of an agent's outputs over time. Reliability tracks uptime, consistency, and adherence to SLAs. Honesty evaluates whether an agent's actual capabilities match its advertised capability card. Safety assesses adherence to behavioral constraints and ethical guidelines.\n\nThese scores are computed from historical interaction data and shared through federated reputation networks — similar to how credit scores work for humans, but with much faster update cycles. An agent's trust score can change after every interaction, creating strong incentives for consistent high-quality behavior.\n\nThe cold-start problem remains the biggest challenge: how do you evaluate a new agent with no interaction history? Current solutions include organizational vouching, standardized capability testing, and graduated trust escalation where new agents start with limited access and earn broader privileges through demonstrated reliability.`,
      sources: [
        { agentId: 'research-hub', dataType: 'article' },
        { agentId: 'market-pulse', dataType: 'sentiment' },
      ],
      createdAt: '2026-03-05T08:00:00Z',
      updatedAt: '2026-03-05T08:00:00Z',
    },
    {
      id: 'draft-004',
      title: 'Securing Agent Communication Channels',
      status: 'draft',
      content: `As multi-agent systems proliferate, securing the communication channels between agents becomes a critical concern. Recent research has revealed several attack vectors unique to agent-to-agent interactions that traditional security measures do not address.\n\nPrompt injection through agent protocols is perhaps the most concerning threat. Malicious agents can craft responses that, when processed by the requesting agent's LLM, alter its behavior or extract sensitive information. This works because most agents feed received messages directly into their LLM context without adequate sanitization.\n\nDefenses against these attacks require a layered approach. Content-aware message parsing separates data from instructions in agent messages, preventing injected instructions from being executed. Cryptographic message integrity verification ensures messages haven't been tampered with in transit. Adversarial robustness training helps agents recognize and resist manipulation attempts.\n\nBeyond prompt injection, organizations must also consider data exfiltration through agent chains, capability escalation attacks where agents request more permissions than needed, and denial-of-service attacks that exploit expensive agent operations. The security community recommends treating all agent-to-agent messages as untrusted input — the same principle that revolutionized web security two decades ago.`,
      sources: [
        { agentId: 'research-hub', dataType: 'article' },
        { agentId: 'research-hub', dataType: 'narrative' },
      ],
      createdAt: '2026-03-06T12:00:00Z',
      updatedAt: '2026-03-06T12:00:00Z',
    },
    {
      id: 'draft-005',
      title: 'Market Trends: AI Infrastructure Spending in Q1 2026',
      status: 'review',
      content: `AI infrastructure spending surged 34% year-over-year in Q1 2026, driven primarily by enterprise adoption of multi-agent systems and the compute requirements they demand. This analysis synthesizes market data from multiple sources to paint a comprehensive picture of where the money is flowing.\n\nThe largest spending category remains GPU compute for model inference, accounting for 45% of total AI infrastructure budgets. However, the fastest-growing category is agent orchestration platforms — tools and services that manage multi-agent workflows — which grew 120% quarter-over-quarter. This reflects the industry's shift from building individual AI features to deploying interconnected agent systems.\n\nAgent communication infrastructure represents an emerging spend category that barely existed six months ago. Companies are investing in message brokers optimized for agent protocols, capability discovery services, and trust management platforms. Early-stage startups in this space have collectively raised over $800M in funding.\n\nNotably, spending on traditional monolithic AI platforms declined 12%, suggesting that the market is decisively moving toward composable, agent-based architectures. Organizations that invested early in agent infrastructure report 2.5x faster time-to-deployment for new AI capabilities compared to those still running monolithic systems.`,
      sources: [
        { agentId: 'market-pulse', dataType: 'trend-data' },
        { agentId: 'market-pulse', dataType: 'sentiment' },
        { agentId: 'research-hub', dataType: 'article' },
      ],
      createdAt: '2026-03-08T07:00:00Z',
      updatedAt: '2026-03-08T16:45:00Z',
    },
  ];

  private nextId = 6;

  getAll(): Draft[] {
    return this.drafts;
  }

  getById(id: string): Draft {
    const draft = this.drafts.find((d) => d.id === id);
    if (!draft) {
      throw new NotFoundException(`Draft "${id}" not found`);
    }
    return draft;
  }

  create(dto: CreateDraftDto): Draft {
    const now = new Date().toISOString();
    const draft: Draft = {
      id: `draft-${String(this.nextId++).padStart(3, '0')}`,
      title: dto.title,
      status: 'draft',
      content: dto.content,
      sources: dto.sources || [],
      createdAt: now,
      updatedAt: now,
    };
    this.drafts.push(draft);
    return draft;
  }

  update(id: string, dto: UpdateDraftDto): Draft {
    const draft = this.getById(id);
    if (dto.title !== undefined) draft.title = dto.title;
    if (dto.content !== undefined) draft.content = dto.content;
    if (dto.status !== undefined) draft.status = dto.status;
    if (dto.sources !== undefined) draft.sources = dto.sources;
    draft.updatedAt = new Date().toISOString();
    return draft;
  }

  delete(id: string): { deleted: true; id: string } {
    const index = this.drafts.findIndex((d) => d.id === id);
    if (index === -1) {
      throw new NotFoundException(`Draft "${id}" not found`);
    }
    this.drafts.splice(index, 1);
    return { deleted: true, id };
  }

  generateDraft(topic: string): Draft {
    const now = new Date().toISOString();
    const draft: Draft = {
      id: `draft-${String(this.nextId++).padStart(3, '0')}`,
      title: `Analysis: ${topic}`,
      status: 'draft',
      content: `This is an auto-generated draft analyzing "${topic}" synthesized from multiple agent sources.\n\nThe topic of ${topic} has been gaining significant attention in the AI ecosystem. Recent developments suggest that ${topic} will play a crucial role in shaping how autonomous agents interact, transact, and collaborate in production environments.\n\nKey findings from our multi-source analysis indicate three major trends. First, investment in ${topic}-related infrastructure has increased substantially over the past quarter. Second, early adopters of ${topic} solutions report measurable improvements in agent system reliability and performance. Third, standardization efforts around ${topic} are accelerating, with multiple industry working groups publishing draft specifications.\n\nLooking ahead, we expect ${topic} to become a foundational component of the agent economy. Organizations that invest in understanding and implementing ${topic} now will have a significant competitive advantage as multi-agent systems become the default architecture for AI-powered applications.\n\nThis draft was synthesized from ResearchHub narrative analysis and MarketPulse trend data. Further refinement is recommended before publication.`,
      sources: [
        { agentId: 'research-hub', dataType: 'narrative' },
        { agentId: 'market-pulse', dataType: 'trend-data' },
      ],
      createdAt: now,
      updatedAt: now,
    };
    this.drafts.push(draft);
    return draft;
  }
}
