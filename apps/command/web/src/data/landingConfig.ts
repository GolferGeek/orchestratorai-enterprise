/**
 * Landing page content configuration.
 * All copy lives here — update this file to change page content without touching components.
 */

export interface ProductCard {
  name: string;
  slug: string;
  icon: string;
  tagline: string;
  description: string;
  features: string[];
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

export interface Feature {
  icon: string;
  title: string;
  description: string;
}

// ─── Hero ────────────────────────────────────────────────────────────────────

export const heroContent = {
  headline: 'Everything in Place. Ready to Build.',
  subheadline:
    'We\'ve built the agent framework, the LangGraph workflows, the security layer, the observability infrastructure, and the multi-product shell. Now we work with you to make it yours — custom agents, custom workflows, your industry, your scale.',
  primaryCta: { label: 'Start the Conversation', href: 'mailto:hello@orchestratorai.com' },
  secondaryCta: { label: 'See the Platform', href: '/features' },
};

// ─── Products (driven by central product registry) ──────────────────────────

import { getAllProducts } from '@orchestrator-ai/transport-types';

export const products: ProductCard[] = getAllProducts().map(def => ({
  name: def.displayName,
  slug: def.slug,
  icon: def.emoji,
  tagline: def.tagline,
  description: def.description,
  features: def.features,
}));

// ─── Features ────────────────────────────────────────────────────────────────

export const platformFeatures: Feature[] = [
  {
    icon: '🔐',
    title: 'Enterprise Security',
    description:
      'Role-based access control, organization isolation, sovereign mode for sensitive data, full audit trails on every agent call.',
  },
  {
    icon: '📡',
    title: 'A2A Protocol',
    description:
      'JSON-RPC 2.0 agent-to-agent communication. Your agents talk to each other and to the world with a standardized, versioned protocol.',
  },
  {
    icon: '🧠',
    title: 'Multi-Provider LLMs',
    description:
      'OpenAI, Anthropic, Azure, GCP — bring your own providers. Switch models per-agent, per-task, per-organization without code changes.',
  },
  {
    icon: '📊',
    title: 'Full Observability',
    description:
      'ExecutionContext flows through every call. Token usage, latency, cost attribution, and routing decisions — tracked for every LLM call.',
  },
  {
    icon: '⚙️',
    title: 'Deterministic Pipelines',
    description:
      'LangGraph-powered workflows that are reproducible and debuggable. Not prompt spaghetti — real engineering.',
  },
  {
    icon: '🌍',
    title: 'Multi-Organization',
    description:
      'One platform, many organizations. Isolated data, separate entitlements, org-specific agents — enterprise multi-tenancy from day one.',
  },
];

// ─── Pricing ─────────────────────────────────────────────────────────────────

export const pricingTiers: PricingTier[] = [
  {
    name: 'Pilot Program',
    price: 'Let\'s Talk',
    period: '',
    description: 'A focused engagement to prove value fast. We work with your team to deploy a meaningful slice of the platform — real agents, real workflows, real results — in weeks, not quarters.',
    features: [
      'Hands-on collaboration with our team',
      'Two to three custom agents for your domain',
      'Full platform access (all six products)',
      'Direct access to the engineering team',
      'Clear path to full partnership',
    ],
    featured: false,
    ctaLabel: 'Start the Conversation',
  },
  {
    name: 'Full Partnership',
    price: 'Let\'s Talk',
    period: '',
    description: 'A comprehensive build-out of your AI platform. We work alongside your team to build, deploy, and evolve a complete multi-agent system tailored to your industry, your data, and your workflows.',
    features: [
      'Full platform customization for your domain',
      'Custom LangGraph workflows built for your use cases',
      'Ongoing collaboration as AI evolves',
      'Influence over platform roadmap',
      'Early access to new capabilities',
      'Sovereign mode deployment if required',
    ],
    featured: true,
    ctaLabel: 'Become a Partner',
  },
];

// ─── About ───────────────────────────────────────────────────────────────────

export const aboutContent = {
  headline: 'We Build Together',
  mission:
    'OrchestratorAI was built on a simple conviction: the most valuable AI systems are deterministic pipelines that coordinate specialized agents — and those systems need to be built by people who understand both the technology and your business. That\'s the partnership we offer. The infrastructure is ready. The question is what we build with it.',
  values: [
    {
      title: 'No Fallbacks',
      description: 'We fix root causes. Our platform surfaces errors — it never swallows them silently. That engineering discipline is what you\'re partnering with.',
    },
    {
      title: 'Real Engineering',
      description: 'LangGraph workflows, typed contracts, ExecutionContext tracing. This is software built to last, not prompts held together with string.',
    },
    {
      title: 'Built for Your Scale',
      description: 'Security, multi-tenancy, and observability are built in from day one. When you grow, the platform grows with you.',
    },
  ],
};
