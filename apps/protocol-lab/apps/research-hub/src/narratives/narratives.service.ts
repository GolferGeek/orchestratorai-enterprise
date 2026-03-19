import { Injectable } from '@nestjs/common';

export type Personality = 'pragmatist' | 'strategist' | 'contrarian' | 'futurist' | 'scout';

export interface Narrative {
  personality: Personality;
  title: string;
  content: string;
  generatedAt: string;
}

@Injectable()
export class NarrativesService {
  private readonly narratives: Record<Personality, Narrative> = {
    pragmatist: {
      personality: 'pragmatist',
      title: 'The Pragmatist View: Building What Works Today',
      content:
        'The current wave of AI agent development is producing tangible, deployable systems that solve real business problems right now. Companies implementing agent-to-agent communication protocols are seeing 40% reductions in integration costs and 3x faster time-to-market for cross-system workflows. The key insight: you don\'t need AGI to get massive value from agent architectures. Simple, well-defined capability cards and REST-based discovery protocols are sufficient for 80% of enterprise use cases. The payment protocol space is maturing rapidly — mock payment rails are being replaced by real micropayment infrastructure, with settlement times under 500ms. The practical path forward is clear: standardize on capability-based discovery, implement trust scoring with simple allowlists, and layer on complexity only when the use case demands it. Teams that over-engineer their agent protocols are shipping slower than those who start with HTTP and iterate.',
      generatedAt: '2026-03-09T00:00:00.000Z',
    },
    strategist: {
      personality: 'strategist',
      title: 'The Strategist View: Positioning for the Agent Economy',
      content:
        'We are witnessing the emergence of an entirely new economic layer — the agent economy. Within 18 months, the majority of B2B API traffic will be agent-initiated rather than human-initiated. This has profound implications for competitive strategy. First-mover advantage in agent discovery protocols creates network effects: agents that are easy to find and negotiate with will accumulate trust scores faster, creating a flywheel that disadvantages late entrants. The payment protocol layer is the strategic chokepoint — whoever controls the default payment rails for agent-to-agent transactions will capture outsized value. Smart organizations are investing now in three areas: (1) making their services discoverable via .well-known/agent.json endpoints, (2) building sophisticated capability negotiation that can handle complex multi-step workflows, and (3) establishing trust frameworks that balance openness with security. The winners in the agent economy won\'t be the ones with the best AI — they\'ll be the ones with the best protocols.',
      generatedAt: '2026-03-09T00:00:00.000Z',
    },
    contrarian: {
      personality: 'contrarian',
      title: 'The Contrarian View: Against the Agent Hype',
      content:
        'The agent-to-agent communication narrative is dangerously overhyped. Here\'s what nobody is saying: most "agent communication protocols" are just REST APIs with extra steps. The .well-known/agent.json pattern is service discovery — a solved problem since the 1990s. Trust scoring between agents is reputation systems — another well-trodden path with known failure modes (Sybil attacks, cold start problems, gaming). The payment protocol enthusiasm ignores that micropayments have failed repeatedly for 25 years, and adding "AI" to the label doesn\'t fix the fundamental economic friction. What\'s actually valuable isn\'t agent autonomy — it\'s human-supervised agent pipelines with clear accountability chains. The industry is making the classic mistake of optimizing for agent independence when it should be optimizing for agent transparency. The real opportunity is in observability and audit tooling for agent interactions, not in making agents more autonomous. Build the guardrails, not the racetrack.',
      generatedAt: '2026-03-09T00:00:00.000Z',
    },
    futurist: {
      personality: 'futurist',
      title: 'The Futurist View: Dawn of the Autonomous Web',
      content:
        'We are standing at the threshold of the most significant transformation in computing since the internet itself: the emergence of the autonomous web. Within five years, the majority of internet traffic will be agent-to-agent, not human-to-human or human-to-machine. The protocols being developed today — capability discovery, trust negotiation, machine payments — are the TCP/IP of this new era. Imagine a web where your personal AI agent negotiates with thousands of specialized agents to plan your vacation, optimize your portfolio, manage your health, and run your business — all through standardized protocols that enable seamless collaboration. The agent economy will dwarf the app economy because it removes the human bottleneck from transaction velocity. Multi-agent systems will evolve emergent behaviors that no individual agent was programmed for, creating value through collaboration patterns we can\'t yet predict. The organizations building agent protocol infrastructure today are laying the foundation for a trillion-dollar ecosystem.',
      generatedAt: '2026-03-09T00:00:00.000Z',
    },
    scout: {
      personality: 'scout',
      title: 'The Scout View: Emerging Signals and Early Warnings',
      content:
        'Three signals are flashing that most analysts are missing. First, the convergence of agent communication standards: Google\'s A2A protocol, Anthropic\'s MCP, and the OpenAI function-calling patterns are converging toward a common capability-based interaction model. This convergence is happening faster than expected and will likely produce a de facto standard within 12 months. Second, the enterprise adoption curve for agent architectures has inflected — Fortune 500 companies that were "exploring" six months ago are now in production deployment. The trigger was the realization that agent-to-agent protocols solve the API integration nightmare that has plagued enterprises for decades. Third, and most concerning: adversarial agent research is accelerating. Papers on agent manipulation, prompt injection through agent protocols, and trust score poisoning are appearing weekly. The security surface of agent communication is vastly underestimated. The scout recommendation: invest heavily in agent protocol adoption while simultaneously building robust adversarial testing frameworks.',
      generatedAt: '2026-03-09T00:00:00.000Z',
    },
  };

  getByPersonality(personality: string): Narrative | undefined {
    return this.narratives[personality as Personality];
  }

  getAllPersonalities(): Personality[] {
    return Object.keys(this.narratives) as Personality[];
  }
}
