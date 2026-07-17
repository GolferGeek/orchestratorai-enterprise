/**
 * Module Registry — Single source of truth for platform module metadata.
 *
 * Every UI component that displays a module name, tagline, or description
 * should read from this registry instead of hardcoding strings.
 *
 * The `slug` is the current code identifier used in routing and entitlement APIs.
 * The `displayName` is the user-facing label that can be
 * changed by switching presets.
 *
 * Two naming presets ship out of the box:
 *   - 'marketing' — the polished module names used in the unified platform
 *   - 'internal'  — plain-English names for implementation discussions
 *
 * Call `setActivePreset('internal')` at app startup to switch.
 */

export type ProductSlug =
  | 'command'
  | 'workflows'
  | 'agents'
  | 'ambient'
  | 'secure-conversations'
  | 'admin';

/** Display-layer fields that a naming preset can override */
export interface ProductDisplayOverride {
  displayName: string;
  tagline: string;
}

export type ProductCategory = 'agents' | 'ambient' | 'admin';

export const PRODUCT_CATEGORIES: { key: ProductCategory; label: string }[] = [
  { key: 'agents', label: 'Agents & Workflows' },
  { key: 'ambient', label: 'Ambient' },
  { key: 'admin', label: 'Administration' },
];

export interface ProductDefinition {
  /** Permanent code identifier — never changes */
  slug: ProductSlug;
  /** User-facing display name */
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
  /** Navigation category for grouping in sidebars */
  category?: ProductCategory;
}

// ─── Naming Presets ─────────────────────────────────────────────────────────

export type PresetName = 'marketing' | 'internal';

/** Marketing preset — polished module names for clients and demos */
const MARKETING_NAMES: Record<ProductSlug, ProductDisplayOverride> = {
  command:        { displayName: 'OrchestratorAI',  tagline: 'Navigation Shell' },
  workflows:      { displayName: 'Workflows',       tagline: 'Complex Agent Workflows' },
  agents:         { displayName: 'Agents',          tagline: 'Composable Agent Foundation' },
  ambient:        { displayName: 'Ambient',         tagline: 'Ambient Automation' },
  'secure-conversations': { displayName: 'Secure Conversations', tagline: 'External A2A Communication' },
  admin:          { displayName: 'Administration',  tagline: 'Full Platform Administration' },
};

/** Internal preset — plain-English names that say what each module does */
const INTERNAL_NAMES: Record<ProductSlug, ProductDisplayOverride> = {
  command:        { displayName: 'OrchestratorAI',      tagline: 'Navigation Shell' },
  workflows:      { displayName: 'Workflows',            tagline: 'Complex Agent Workflows' },
  agents:         { displayName: 'Agents',               tagline: 'Composable Agent Foundation' },
  ambient:        { displayName: 'Ambient',              tagline: 'Ambient Automation' },
  'secure-conversations': { displayName: 'Secure Conversations', tagline: 'External A2A Gateway' },
  admin:          { displayName: 'Administration',        tagline: 'Full Platform Administration' },
};

const PRESETS: Record<PresetName, Record<ProductSlug, ProductDisplayOverride>> = {
  marketing: MARKETING_NAMES,
  internal: INTERNAL_NAMES,
};

// ─── Base Module Data (infrastructure, ports, descriptions) ────────────────

interface BaseProductData {
  slug: ProductSlug;
  description: string;
  features: string[];
  emoji: string;
  ionicon: string;
  webPort: number;
  apiPort?: number;
  category?: ProductCategory;
}

const BASE_PRODUCTS: Record<ProductSlug, BaseProductData> = {
  command: {
    slug: 'command',
    description: 'The entry point to the OrchestratorAI Enterprise platform. Routes users to modules based on their entitlements.',
    features: [],
    emoji: '🏠',
    ionicon: 'grid-outline',
    webPort: 6701,
  },
  workflows: {
    slug: 'workflows',
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
    webPort: 6701,
    apiPort: 6700,
    category: 'agents',
  },
  agents: {
    slug: 'agents',
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
    webPort: 6701,
    apiPort: 6700,
    category: 'agents',
  },
  ambient: {
    slug: 'ambient',
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
    webPort: 6701,
    apiPort: 6700,
    category: 'ambient',
  },
  'secure-conversations': {
    slug: 'secure-conversations',
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
    webPort: 6701,
    apiPort: 6700,
    category: 'ambient',
  },
  admin: {
    slug: 'admin',
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
    webPort: 6701,
    apiPort: 6700,
    category: 'admin',
  },
};

// ─── Active Registry (built from base + active preset) ──────────────────────

let activePreset: PresetName = 'marketing';

function buildRegistry(preset: PresetName): Record<ProductSlug, ProductDefinition> {
  const names = PRESETS[preset];
  const result = {} as Record<ProductSlug, ProductDefinition>;
  for (const slug of Object.keys(BASE_PRODUCTS) as ProductSlug[]) {
    result[slug] = {
      ...BASE_PRODUCTS[slug],
      ...names[slug],
    };
  }
  return result;
}

/** The active module registry. Rebuilt when the preset changes. */
export let PRODUCT_REGISTRY: Record<ProductSlug, ProductDefinition> = buildRegistry(activePreset);

/**
 * Switch the active naming preset. Call this at app startup (e.g. in main.ts)
 * before any component renders.
 *
 * @example
 *   import { setActivePreset } from '@orchestrator-ai/transport-types';
 *   setActivePreset('marketing'); // use polished names for client demos
 */
export function setActivePreset(preset: PresetName): void {
  activePreset = preset;
  PRODUCT_REGISTRY = buildRegistry(preset);
}

/** Get the currently active preset name */
export function getActivePreset(): PresetName {
  return activePreset;
}

/** All module slugs (excludes 'command' which is the shell, not a module) */
export const PRODUCT_SLUGS: ProductSlug[] = ['agents', 'workflows', 'ambient', 'secure-conversations', 'admin'];

/** Get a module definition by slug. Returns undefined for unknown slugs. */
export function getProduct(slug: string): ProductDefinition | undefined {
  return PRODUCT_REGISTRY[slug as ProductSlug];
}

/** Get the display name for a module slug. Returns the slug itself if not found. */
export function getProductDisplayName(slug: string): string {
  return PRODUCT_REGISTRY[slug as ProductSlug]?.displayName ?? slug;
}

/** Get all product definitions (excluding command shell) */
export function getAllProducts(): ProductDefinition[] {
  return PRODUCT_SLUGS.map(slug => PRODUCT_REGISTRY[slug]);
}

/** Get products grouped by category, in display order */
export function getProductsByCategory(): { key: ProductCategory; label: string; products: ProductDefinition[] }[] {
  const all = getAllProducts();
  return PRODUCT_CATEGORIES
    .map(cat => ({
      ...cat,
      products: all.filter(p => p.category === cat.key),
    }))
    .filter(cat => cat.products.length > 0);
}
