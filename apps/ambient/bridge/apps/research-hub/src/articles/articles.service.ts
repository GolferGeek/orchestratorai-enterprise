import { Injectable } from '@nestjs/common';

export interface Article {
  id: string;
  categoryId: string;
  title: string;
  summary: string;
  content: string;
  date: string;
  signalStrength: number;
  author: string;
}

@Injectable()
export class ArticlesService {
  private readonly articles: Article[] = [
    // AI Agents
    {
      id: 'art-001',
      categoryId: 'ai-agents',
      title: 'Tool-Use Agents Reach Production Maturity',
      summary: 'Major cloud providers now offer production-grade tool-use agent frameworks with built-in safety rails and observability.',
      content: 'The landscape of AI agent deployment has shifted dramatically in Q1 2026. AWS, Google Cloud, and Azure have all released production-grade agent frameworks that include built-in tool-use capabilities, safety guardrails, and comprehensive observability. These frameworks standardize the agent-tool interaction pattern, reducing the need for custom orchestration code by an estimated 60%. Key features include automatic retry with exponential backoff, tool result validation, and real-time cost tracking. Early adopters report 3x improvements in development velocity for agent-based workflows.',
      date: '2026-03-05',
      signalStrength: 91,
      author: 'ResearchHub Analysis',
    },
    {
      id: 'art-002',
      categoryId: 'ai-agents',
      title: 'Agent Memory Systems: From RAG to Persistent Context',
      summary: 'New architectures for agent memory go beyond retrieval-augmented generation to maintain persistent, structured context across sessions.',
      content: 'The next evolution of agent memory is here. While RAG provided a foundation for grounding agent responses in external knowledge, new persistent context architectures enable agents to maintain structured memory across sessions, tasks, and even organizational boundaries. These systems use hierarchical memory stores — working memory for the current task, episodic memory for recent interactions, and semantic memory for long-term knowledge. The breakthrough is in memory consolidation: agents can now automatically identify which working memory items should be promoted to long-term storage, reducing context window pressure while maintaining continuity.',
      date: '2026-03-02',
      signalStrength: 87,
      author: 'ResearchHub Analysis',
    },
    {
      id: 'art-003',
      categoryId: 'ai-agents',
      title: 'The Rise of Specialized Micro-Agents',
      summary: 'The industry is shifting from monolithic general-purpose agents to composable micro-agents with narrow, well-defined capabilities.',
      content: 'A clear architectural pattern is emerging: instead of building large, general-purpose agents that try to do everything, leading organizations are decomposing agent capabilities into small, specialized micro-agents. Each micro-agent has a single responsibility — summarization, data extraction, code review, scheduling — and exposes it through a standardized capability card. Orchestrator agents compose these micro-agents into workflows, similar to how microservices replaced monoliths in traditional software. This approach improves testability, reduces failure blast radius, and enables independent scaling of individual capabilities.',
      date: '2026-02-28',
      signalStrength: 84,
      author: 'ResearchHub Analysis',
    },
    // Payment Protocols
    {
      id: 'art-004',
      categoryId: 'payment-protocols',
      title: 'Micropayment Rails for Agent Transactions',
      summary: 'New payment infrastructure enables sub-cent transactions between AI agents with settlement times under 200ms.',
      content: 'The economic infrastructure for the agent economy is being built in real-time. Three startups have launched micropayment rails specifically designed for agent-to-agent transactions, with settlement times under 200ms and transaction costs below 0.1 cents. These systems use payment channels similar to Lightning Network but optimized for the high-frequency, low-value transaction patterns typical of agent interactions. Key innovation: pre-authorized payment envelopes that allow agents to transact within budget constraints without per-transaction approval, reducing latency by 10x compared to traditional payment authorization flows.',
      date: '2026-03-07',
      signalStrength: 76,
      author: 'ResearchHub Analysis',
    },
    {
      id: 'art-005',
      categoryId: 'payment-protocols',
      title: 'Agent Pricing Negotiation: Beyond Fixed Rates',
      summary: 'Dynamic pricing protocols allow agents to negotiate service costs based on urgency, quality requirements, and trust scores.',
      content: 'Fixed-rate API pricing is giving way to dynamic, negotiated pricing in agent-to-agent interactions. New protocols enable agents to negotiate service costs based on multiple factors: task urgency (rush jobs cost more), quality requirements (higher accuracy demands premium pricing), trust scores (established relationships get better rates), and volume commitments (bulk discounts for recurring workflows). Early implementations show that dynamic pricing leads to more efficient resource allocation, with average costs 23% lower than fixed-rate equivalents while providing higher quality for premium requests.',
      date: '2026-03-01',
      signalStrength: 72,
      author: 'ResearchHub Analysis',
    },
    // Trust & Identity
    {
      id: 'art-006',
      categoryId: 'trust-identity',
      title: 'Decentralized Agent Identity: DIDs Meet AI',
      summary: 'Decentralized Identifier (DID) standards are being adapted for AI agent identity, enabling verifiable credentials without central authorities.',
      content: 'The W3C Decentralized Identifier standard is being adapted for AI agent identity management. New DID methods specifically designed for agents enable verifiable identity without relying on central certificate authorities. Agents can prove their identity, capabilities, and organizational affiliation through cryptographic credentials that are independently verifiable. This solves the "who are you talking to?" problem in multi-agent systems. Key development: capability-bound credentials that tie an agent\'s identity to specific authorized actions, preventing capability escalation attacks.',
      date: '2026-03-06',
      signalStrength: 83,
      author: 'ResearchHub Analysis',
    },
    {
      id: 'art-007',
      categoryId: 'trust-identity',
      title: 'Trust Score Frameworks: Measuring Agent Reliability',
      summary: 'Standardized trust scoring systems are emerging to help agents evaluate the reliability of potential collaborators.',
      content: 'Multiple trust scoring frameworks have been proposed for evaluating agent reliability in multi-agent systems. The leading approach uses a multi-dimensional trust vector that captures response quality (accuracy of outputs), reliability (uptime and consistency), honesty (alignment between advertised and actual capabilities), and safety (adherence to behavioral constraints). These scores are computed from historical interaction data and shared through a federated reputation network. The challenge: cold-start bootstrapping for new agents with no interaction history. Current solutions include organizational vouching, capability testing, and graduated trust escalation.',
      date: '2026-03-04',
      signalStrength: 86,
      author: 'ResearchHub Analysis',
    },
    {
      id: 'art-008',
      categoryId: 'trust-identity',
      title: 'Agent Authentication: Signing and Verification at Scale',
      summary: 'High-throughput message signing protocols enable agents to authenticate every interaction without performance degradation.',
      content: 'A new generation of agent authentication protocols addresses the performance challenge of signing every agent-to-agent message. Using Ed25519 signatures with pre-computed key material, agents can now sign and verify messages with sub-microsecond overhead. This makes it practical to authenticate every single interaction, not just session establishment. The protocol includes message chaining (each message references the hash of the previous one) to prevent replay attacks, and rotating key schedules to limit the impact of key compromise. Enterprise deployments report zero measurable performance impact from full-interaction authentication.',
      date: '2026-02-25',
      signalStrength: 79,
      author: 'ResearchHub Analysis',
    },
    // Multi-Agent Systems
    {
      id: 'art-009',
      categoryId: 'multi-agent-systems',
      title: 'Orchestration Patterns for Multi-Agent Workflows',
      summary: 'Three dominant orchestration patterns are emerging: pipeline, hub-and-spoke, and autonomous swarm.',
      content: 'The multi-agent systems community is converging on three primary orchestration patterns. Pipeline orchestration chains agents sequentially, each processing and enriching the output of the previous one — ideal for data processing and content generation workflows. Hub-and-spoke orchestration uses a central coordinator to dispatch subtasks to specialized agents and aggregate results — best for research and analysis tasks. Autonomous swarm orchestration allows agents to self-organize around a shared objective using stigmergic communication — promising for exploration and creative tasks but harder to control. Most production systems use pipeline or hub-and-spoke; swarm architectures remain experimental.',
      date: '2026-03-08',
      signalStrength: 90,
      author: 'ResearchHub Analysis',
    },
    {
      id: 'art-010',
      categoryId: 'multi-agent-systems',
      title: 'Inter-Agent Communication: Protocol Convergence',
      summary: 'Major AI labs are converging on compatible agent communication standards, with a unified protocol expected by mid-2026.',
      content: 'The fragmented landscape of agent communication protocols is rapidly consolidating. Google\'s A2A protocol, Anthropic\'s Model Context Protocol (MCP), and the emerging OpenAgent standard share enough common ground that a unified interoperability layer is expected by mid-2026. The convergence centers on three shared primitives: capability cards (what an agent can do), message envelopes (standardized request/response wrapping), and discovery endpoints (.well-known URIs for agent metadata). Implementations that adopt these three primitives today will be well-positioned for the unified standard. The remaining areas of divergence — payment semantics, trust model, and encryption requirements — are being addressed in working groups.',
      date: '2026-03-03',
      signalStrength: 93,
      author: 'ResearchHub Analysis',
    },
    // AI Safety
    {
      id: 'art-011',
      categoryId: 'ai-safety',
      title: 'Agent Containment: Sandboxing Autonomous Systems',
      summary: 'New containment architectures limit agent capabilities and prevent unauthorized actions through hardware-backed sandboxes.',
      content: 'As AI agents gain more autonomy, containment becomes critical. New sandboxing architectures use hardware-backed security enclaves to strictly limit agent capabilities. Each agent runs in an isolated environment with explicit capability grants — file system access, network access, tool use — that cannot be escalated by the agent itself. The sandbox monitors all agent actions against a policy specification and can halt execution if unexpected behavior is detected. Key innovation: capability attenuation, where sub-agents spawned by an agent can only receive a subset of the parent\'s capabilities, preventing privilege escalation through agent chains.',
      date: '2026-03-07',
      signalStrength: 94,
      author: 'ResearchHub Analysis',
    },
    {
      id: 'art-012',
      categoryId: 'ai-safety',
      title: 'Prompt Injection Through Agent Protocols',
      summary: 'Researchers demonstrate novel prompt injection attacks that exploit agent-to-agent communication channels.',
      content: 'A concerning class of attacks has been demonstrated: prompt injection through agent communication protocols. Malicious agents can craft responses that, when processed by the requesting agent, alter its behavior or extract sensitive information. The attack works because most agents feed received messages directly into their LLM context without adequate sanitization. Proposed defenses include content-aware message parsing (separating data from instructions in agent messages), cryptographic message integrity verification, and adversarial robustness training. The research community recommends treating all agent-to-agent messages as untrusted input, similar to web security\'s "never trust user input" principle.',
      date: '2026-03-04',
      signalStrength: 96,
      author: 'ResearchHub Analysis',
    },
    {
      id: 'art-013',
      categoryId: 'ai-safety',
      title: 'Constitutional AI for Multi-Agent Systems',
      summary: 'Extending Constitutional AI principles to govern interactions between multiple autonomous agents in shared environments.',
      content: 'Constitutional AI, originally developed for single-agent alignment, is being extended to multi-agent settings. The key challenge: individual agents may be well-aligned, but their interactions can produce emergent behaviors that violate safety constraints. Multi-agent constitutional frameworks define interaction-level rules: agents must not collude to circumvent human oversight, must not create information asymmetries that disadvantage humans, and must escalate to human judgment when interaction outcomes are uncertain. Implementation uses a constitutional monitor agent that observes inter-agent communication and can intervene when constitutional violations are detected. Early results show 85% reduction in emergent misalignment compared to unconstrained multi-agent systems.',
      date: '2026-02-27',
      signalStrength: 91,
      author: 'ResearchHub Analysis',
    },
  ];

  getAll(): Omit<Article, 'content'>[] {
    return this.articles.map(({ content, ...rest }) => rest);
  }

  getById(id: string): Article | undefined {
    return this.articles.find((a) => a.id === id);
  }

  getByCategoryId(categoryId: string): Omit<Article, 'content'>[] {
    return this.articles
      .filter((a) => a.categoryId === categoryId)
      .map(({ content, ...rest }) => rest);
  }

  search(query: string): Omit<Article, 'content'>[] {
    const lowerQuery = query.toLowerCase();
    return this.articles
      .filter(
        (a) =>
          a.title.toLowerCase().includes(lowerQuery) ||
          a.summary.toLowerCase().includes(lowerQuery) ||
          a.content.toLowerCase().includes(lowerQuery),
      )
      .map(({ content, ...rest }) => rest);
  }
}
