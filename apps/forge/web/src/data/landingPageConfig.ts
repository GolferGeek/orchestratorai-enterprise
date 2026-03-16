export interface ShowcaseItem {
  title: string;
  subtitle: string;
  description: string;
  pipeline: string[];
  status: 'live' | 'coming-soon';
  icon: string;
}

export interface TableStakesAgent {
  name: string;
  description: string;
  icon: string;
  capabilities: string[];
}

export interface PricingTier {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  featured: boolean;
  ctaLabel: string;
}

export const heroContent = {
  headline: 'Your Complex Idea. Our Agent Swarm.',
  subheadline:
    'We build multi-agent AI systems that turn ambitious ideas into working products — coordinating dozens of specialized agents in deterministic pipelines that were impossible before.',
  primaryCta: { label: 'Talk to Us', href: '#contact' },
  secondaryCta: { label: 'See It In Action', href: '#showcase' },
};

export const missionContent = {
  headline: 'We Build What Didn\'t Exist Before',
  subheadline:
    'Chatbots and HR assistants are table stakes. We partner with companies that have a complex idea — and now, because agents exist, that idea has finally become possible.',
  paragraphs: [
    'You couldn\'t get this many brains controlled in just the right way, in a relatively deterministic fashion, to accomplish something this complex. Until now.',
    'We work with clients who are excited about building something new — not tweaking a template.',
  ],
  stats: [
    { value: '12+', label: 'Specialized Agents' },
    { value: '5', label: 'Agent Types' },
    { value: '100%', label: 'Deterministic Pipelines' },
  ],
};

export const showcaseItems: ShowcaseItem[] = [
  {
    title: 'Finance Intelligence Pipeline',
    subtitle: 'Article → Analysis → Risk → Prediction → Learning',
    description:
      'A swarm of agents that crawls financial news, extracts signals, assesses risk, makes predictions, settles trades, and learns from outcomes — end to end, every single day.',
    pipeline: [
      'Crawl & Ingest',
      'Signal Extraction',
      'Risk Assessment',
      'Prediction Generation',
      'Trade Execution',
      'Postmortem Learning',
    ],
    status: 'live',
    icon: '📈',
  },
  {
    title: 'LinkedIn & Twitter Sales Funnel',
    subtitle: 'Signal → Qualify → Engage → Convert',
    description:
      'An agent-driven sales pipeline for small businesses that monitors social signals, scores prospects, crafts personalized outreach, and nurtures leads through the funnel automatically.',
    pipeline: [
      'Social Monitoring',
      'Lead Scoring',
      'Personalized Outreach',
      'Engagement Tracking',
      'Funnel Nurture',
      'Conversion',
    ],
    status: 'coming-soon',
    icon: '🎯',
  },
];

export const tableStakesAgents: TableStakesAgent[] = [
  {
    name: 'Customer Service Chat',
    description:
      'Conversational AI that handles inquiries, routes to specialists, and resolves issues — customized to your brand voice and knowledge base.',
    icon: '💬',
    capabilities: ['Multi-turn conversation', 'Knowledge base integration', 'Escalation routing'],
  },
  {
    name: 'Customer Service Voice',
    description:
      'Voice-enabled agents that handle phone interactions naturally, transcribe conversations, and take action on behalf of your customers.',
    icon: '🎙️',
    capabilities: ['Natural speech', 'Real-time transcription', 'Action execution'],
  },
  {
    name: 'HR Assistant',
    description:
      'Onboarding, policy Q&A, benefits enrollment, and employee self-service — all handled by agents that know your company inside and out.',
    icon: '👥',
    capabilities: ['Policy Q&A', 'Onboarding workflows', 'Benefits guidance'],
  },
  {
    name: 'Legal Document Review',
    description:
      'Agents that analyze contracts, flag risk clauses, compare against your standards, and summarize findings for your legal team.',
    icon: '⚖️',
    capabilities: ['Contract analysis', 'Risk flagging', 'Clause comparison'],
  },
];

export const pricingTiers: PricingTier[] = [
  {
    name: 'Pre-Built',
    price: '$2,500',
    period: '/month',
    description: 'Production-ready agents, customized to your brand and data.',
    features: [
      'Choose from pre-built agent library',
      'Custom knowledge base',
      'Brand voice tuning',
      'Basic analytics dashboard',
      'Email support',
    ],
    featured: false,
    ctaLabel: 'Get Started',
  },
  {
    name: 'Founding Partner',
    price: 'Custom',
    period: '',
    description: 'We build the agent system you\'ve been imagining. From idea to production.',
    features: [
      'Full custom agent pipeline design',
      'Multi-agent orchestration',
      'Deterministic workflow engineering',
      'Real-time observability',
      'Dedicated engineering partner',
      'Priority support & iteration',
    ],
    featured: true,
    ctaLabel: 'Talk to Us',
  },
  {
    name: 'Enterprise',
    price: 'Contact Us',
    period: '',
    description: 'For organizations deploying agent systems at scale across teams.',
    features: [
      'Everything in Founding Partner',
      'Multi-team agent deployment',
      'SSO & RBAC',
      'SLA guarantees',
      'On-premise option',
      'Custom integrations',
    ],
    featured: false,
    ctaLabel: 'Contact Sales',
  },
];
