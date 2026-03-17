/**
 * Product Registry — Single source of truth for all product metadata.
 *
 * Every UI component that displays a product name, tagline, or description
 * should read from this registry instead of hardcoding strings.
 *
 * The `slug` is the permanent code identifier (used in routing, entitlements,
 * directory names). The `displayName` is the user-facing label that can be
 * changed without touching any other code.
 */

export type ProductSlug =
  | 'command'
  | 'forge'
  | 'compose'
  | 'flow'
  | 'pulse'
  | 'bridge'
  | 'admin';

export interface ProductDefinition {
  /** Permanent code identifier — never changes */
  slug: ProductSlug;
  /** User-facing display name — change this to rebrand */
  displayName: string;
  /** Short tagline for cards and tooltips */
  tagline: string;
  /** Longer marketing description */
  description: string;
  /** Feature bullet points for landing pages */
  features: string[];
  /** Emoji icon for marketing/landing pages */
  emoji: string;
  /** Ionicons icon name (e.g. 'hammer-outline') for nav/sidebar */
  ionicon: string;
  /** Dev port for the web app */
  webPort: number;
  /** Dev port for the API (if applicable) */
  apiPort?: number;
}

/**
 * The product registry. Keyed by slug for O(1) lookup.
 *
 * To rebrand a product, change its `displayName` and `tagline` here.
 * All UI components that import from this registry will pick up the change.
 */
export const PRODUCT_REGISTRY: Record<ProductSlug, ProductDefinition> = {
  command: {
    slug: 'command',
    displayName: 'OrchestratorAI',
    tagline: 'Navigation Shell',
    description: 'The entry point to the OrchestratorAI Enterprise platform. Routes users to products based on their entitlements.',
    features: [],
    emoji: '🏠',
    ionicon: 'grid-outline',
    webPort: 6102,
  },
  forge: {
    slug: 'forge',
    displayName: 'Big Ideas',
    tagline: 'Complex Agent Workflows',
    description:
      'The foundation for your most demanding AI use cases. Working LangGraph workflows ship with the platform — your team extends them for marketing orchestration, legal automation, risk analysis, or any domain-specific pipeline you need.',
    features: [
      'LangGraph multi-agent orchestration',
      'Real-time workflow visualization',
      'Working starter workflows included',
      'Built to extend for your domain',
    ],
    emoji: '⚡',
    ionicon: 'hammer-outline',
    webPort: 6201,
    apiPort: 6200,
  },
  compose: {
    slug: 'compose',
    displayName: 'Table Stakes Agents',
    tagline: 'Composable Agent Foundation',
    description:
      'A complete agent composition framework with working examples. Conversation agents, RAG retrieval, API integrations, and media generation — all wired up and ready to be customized for your data and your use cases.',
    features: [
      'Conversational AI agents',
      'RAG retrieval integration',
      'API & external connectors',
      'Your starting point, not your ceiling',
    ],
    emoji: '🧩',
    ionicon: 'layers-outline',
    webPort: 6301,
    apiPort: 6300,
  },
  flow: {
    slug: 'flow',
    displayName: 'Flow',
    tagline: 'AI-Enhanced Productivity',
    description:
      'A fully functional AI-enhanced productivity layer for your team. Tasks, sprints, file collaboration, and focus tooling ship ready to use — and ready to be extended with agents specific to how your team works.',
    features: [
      'Shared tasks & sprints',
      'AI-assisted planning',
      'Team file management',
      'Customizable for your workflows',
    ],
    emoji: '🌊',
    ionicon: 'git-branch-outline',
    webPort: 6901,
    apiPort: 6900,
  },
  pulse: {
    slug: 'pulse',
    displayName: 'Internal Workflows',
    tagline: 'Ambient Automation',
    description:
      'The infrastructure for ambient AI that watches your systems and acts. Database watchers, file triggers, and event-driven workflows are all wired up — your agents fill in the business logic specific to your operations.',
    features: [
      'Database change watchers',
      'File system triggers',
      'Event-driven workflows',
      'Your business rules, our infrastructure',
    ],
    emoji: '💓',
    ionicon: 'pulse-outline',
    webPort: 6501,
    apiPort: 6500,
  },
  bridge: {
    slug: 'bridge',
    displayName: 'Guardhouse',
    tagline: 'External A2A Communication',
    description:
      'Production-grade agent-to-agent communication infrastructure. The security, authentication, rate limiting, and audit trail are already built — you add the agent endpoints relevant to your partner integrations.',
    features: [
      'A2A protocol (JSON-RPC 2.0)',
      'Inbound agent endpoints',
      'Outbound agent calls',
      'Production security & audit',
    ],
    emoji: '🌉',
    ionicon: 'navigate-outline',
    webPort: 6601,
    apiPort: 6600,
  },
  admin: {
    slug: 'admin',
    displayName: 'Admin',
    tagline: 'Full Platform Administration',
    description:
      'Complete observability and control from day one. LLM analytics, RAG management, agent registry, and organization management ship fully functional — giving you visibility over every AI call on the platform.',
    features: [
      'LLM usage analytics',
      'RAG pipeline management',
      'Agent registry & entitlements',
      'Organization & user management',
    ],
    emoji: '🛡️',
    ionicon: 'shield-checkmark-outline',
    webPort: 6101,
  },
};

/** All product slugs (excludes 'command' which is the shell, not a product) */
export const PRODUCT_SLUGS: ProductSlug[] = ['forge', 'compose', 'flow', 'pulse', 'bridge', 'admin'];

/** Get a product definition by slug. Returns undefined for unknown slugs. */
export function getProduct(slug: string): ProductDefinition | undefined {
  return PRODUCT_REGISTRY[slug as ProductSlug];
}

/** Get the display name for a product slug. Returns the slug itself if not found. */
export function getProductDisplayName(slug: string): string {
  return PRODUCT_REGISTRY[slug as ProductSlug]?.displayName ?? slug;
}

/** Get all product definitions (excluding command shell) */
export function getAllProducts(): ProductDefinition[] {
  return PRODUCT_SLUGS.map(slug => PRODUCT_REGISTRY[slug]);
}
