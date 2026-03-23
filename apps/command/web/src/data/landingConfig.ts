/**
 * Landing page content configuration.
 * All copy lives here — update this file to change page content without touching components.
 */

// ─── Hero ────────────────────────────────────────────────────────────────────

export const heroContent = {
  headline: 'The Starter Kit for Enterprise AI',
  subheadline:
    'SaaS is generic. Off-the-shelf products are generic. Neither can keep up with the speed of AI changes. Building from scratch costs a fortune. There\'s a better way.',
  primaryCta: { label: 'Start the Conversation', href: 'mailto:golfergeek@orchestratorai.io' },
};

// ─── The Problem ─────────────────────────────────────────────────────────────

export const problemContent = {
  headline: 'AI Is Moving Too Fast for Traditional Solutions',
  points: [
    {
      label: 'SaaS',
      problem: 'Designed for the middle. You pay full price, use a fraction, and get locked into their stack and their LLM choices. It can\'t deliver the nuance your organization needs.',
    },
    {
      label: 'Off-the-Shelf Products',
      problem: 'Same generic problem, different deployment. Their product was built for a market, not your situation. AI changes so fast their tech stack becomes outdated before you\'ve finished onboarding.',
    },
    {
      label: 'Build from Scratch',
      problem: 'The right instinct — but where do you find the expertise? Consulting companies move slow, charge a lot, and you spend months on infrastructure before your first agent runs.',
    },
  ],
};

// ─── The Solution ────────────────────────────────────────────────────────────

export const solutionContent = {
  headline: 'A Starter Set for the Build You Were Going to Do Anyway',
  subheadline:
    'Drop the repository. Get the database running. Authentication works. Agents work. Now shape it into the nuanced solution your organization actually needs.',
  points: [
    { text: 'Prototype in days, not quarters' },
    { text: 'Your data stays on your infrastructure' },
    { text: 'Agents tailored to your actual workflows' },
    { text: 'Fun to build — even with structured vibe coding' },
    { text: 'Founder-level consulting at a fraction of the cost' },
  ],
};

// ─── CTA ─────────────────────────────────────────────────────────────────────

export const ctaContent = {
  headline: 'You Don\'t Want to Build from Zero. Neither Did We.',
  subheadline: 'That\'s why this exists. Let\'s talk about what your starter set looks like.',
  primaryCta: { label: 'Start the Conversation', href: 'mailto:golfergeek@orchestratorai.io' },
};

// ─── Pricing (kept for /pricing page) ───────────────────────────────────────

export interface PricingTier {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  featured: boolean;
  ctaLabel: string;
}

export const pricingTiers: PricingTier[] = [
  {
    name: 'Pilot Program',
    price: 'Let\'s Talk',
    period: '',
    description: 'A focused engagement to prove value fast. We work with your team to deploy a meaningful slice of the platform — real agents, real workflows, real results — in weeks, not quarters.',
    features: [
      'Hands-on collaboration with our team',
      'Two to three custom agents for your domain',
      'Full platform access',
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
      'Custom workflows built for your use cases',
      'Ongoing collaboration as AI evolves',
      'Influence over platform roadmap',
      'Early access to new capabilities',
    ],
    featured: true,
    ctaLabel: 'Become a Partner',
  },
];

// ─── About (kept for /about page) ───────────────────────────────────────────

export const aboutContent = {
  headline: 'We Build Together',
  mission:
    'OrchestratorAI was built on a simple conviction: the most valuable AI systems need to be built by people who understand both the technology and your business. That\'s the partnership we offer. The starter kit is ready. The question is what we build with it.',
  values: [
    {
      title: 'Nuance Matters',
      description: 'Generic solutions don\'t work for enterprises with specific needs. We build the nuanced solution your organization actually requires.',
    },
    {
      title: 'Speed Matters',
      description: 'Prototyping in days, not quarters. The starter set means your team is building real agents immediately.',
    },
    {
      title: 'Your Data, Your Rules',
      description: 'Your infrastructure, your LLMs, your data. Nothing leaves your walls unless you decide it should.',
    },
  ],
};
