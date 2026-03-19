export type ProtocolLayer =
  | 'discovery'
  | 'transport'
  | 'negotiation'
  | 'identity'
  | 'payment'
  | 'wallet'
  | 'trust'
  | 'encryption'
  | 'resilience'
  | 'observability'
  | 'orchestration'
  | 'audit';

export const PROTOCOL_LAYERS: ProtocolLayer[] = [
  'discovery',
  'transport',
  'negotiation',
  'identity',
  'payment',
  'wallet',
  'trust',
  'encryption',
  'resilience',
  'observability',
  'orchestration',
  'audit',
];

export interface ProtocolConfig {
  discovery: string;
  transport: string;
  negotiation: string;
  identity: string;
  payment: string;
  wallet: string;
  trust: string;
  encryption: string;
  resilience: string;
  observability: string;
  orchestration: string;
  audit: string;
}

export interface ProtocolPreset {
  id: string;
  name: string;
  description: string;
  config: ProtocolConfig;
}

export interface ProtocolSuite {
  id: string;
  name: string;
  description: string;
  defaultPresetId?: string;
  bundleProviderIds: string[][];
}

export interface ProviderDependency {
  id: string;
  providerIds: string[];
  reason: string;
}

export const PROTOCOL_PRESETS: ProtocolPreset[] = [
  {
    id: 'basic',
    name: 'Basic',
    description: 'Simplest possible setup — great for development and testing',
    config: {
      discovery: 'well-known',
      transport: 'http-rest',
      negotiation: 'capability-card',
      identity: 'local-keys',
      payment: 'mock',
      wallet: 'local-keypair',
      trust: 'allowlist',
      encryption: 'none',
      resilience: 'retry',
      observability: 'file-log',
      orchestration: 'pipeline',
      audit: 'hash-chain',
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Lowest overhead for testing',
    config: {
      discovery: 'well-known',
      transport: 'http-rest',
      negotiation: 'capability-card',
      identity: 'local-keys',
      payment: 'mock',
      wallet: 'local-keypair',
      trust: 'allowlist',
      encryption: 'none',
      resilience: 'retry',
      observability: 'file-log',
      orchestration: 'pipeline',
      audit: 'hash-chain',
    },
  },
  {
    id: 'a2a-full',
    name: 'A2A (Google/LF)',
    description: 'Full A2A protocol suite — Agent Cards, JSON-RPC, and task lifecycle',
    config: {
      discovery: 'a2a-agent-card',
      transport: 'a2a-jsonrpc',
      negotiation: 'a2a-skill-negotiation',
      identity: 'oauth-jwt',
      payment: 'mock',
      wallet: 'local-keypair',
      trust: 'a2a-jws-trust',
      encryption: 'tls-mutual',
      resilience: 'circuit-breaker',
      observability: 'opentelemetry',
      orchestration: 'a2a-task-lifecycle',
      audit: 'hash-chain',
    },
  },
  {
    id: 'a2a-ap2',
    name: 'A2A + Coinbase Payments',
    description: 'A2A protocol with x402 crypto payments and Coinbase CDP wallet',
    config: {
      discovery: 'a2a-agent-card',
      transport: 'a2a-jsonrpc',
      negotiation: 'a2a-skill-negotiation',
      identity: 'oauth-jwt',
      payment: 'x402-usdc',
      wallet: 'coinbase-cdp',
      trust: 'a2a-jws-trust',
      encryption: 'tls-mutual',
      resilience: 'circuit-breaker',
      observability: 'opentelemetry',
      orchestration: 'a2a-task-lifecycle',
      audit: 'hash-chain',
    },
  },
  {
    id: 'commerce-acp',
    name: 'Commerce ACP (OpenAI/Stripe)',
    description: 'Agentic commerce with cart negotiation and checkout orchestration',
    config: {
      discovery: 'well-known',
      transport: 'http-rest',
      negotiation: 'commerce-cart-negotiation',
      identity: 'oauth-jwt',
      payment: 'commerce-checkout',
      wallet: 'local-keypair',
      trust: 'allowlist',
      encryption: 'tls-mutual',
      resilience: 'retry',
      observability: 'opentelemetry',
      orchestration: 'commerce-checkout-fsm',
      audit: 'hash-chain',
    },
  },
  {
    id: 'agntcy-full',
    name: 'AGNTCY ACP (Cisco/LF)',
    description: 'Federated OASF discovery, cryptographic identity, and SLIM encrypted messaging',
    config: {
      discovery: 'agntcy-oasf',
      transport: 'http-rest',
      negotiation: 'capability-card',
      identity: 'agntcy-crypto-identity',
      payment: 'mock',
      wallet: 'local-keypair',
      trust: 'reputation',
      encryption: 'agntcy-slim',
      resilience: 'retry',
      observability: 'opentelemetry',
      orchestration: 'pipeline',
      audit: 'hash-chain',
    },
  },
];

export const PROTOCOL_SUITES: ProtocolSuite[] = [
  {
    id: 'a2a',
    name: 'A2A (Google/LF)',
    description: 'Agent Cards + JSON-RPC + negotiated task lifecycle orchestration',
    defaultPresetId: 'a2a-full',
    bundleProviderIds: [['a2a-agent-card', 'oauth-jwt', 'a2a-task-lifecycle']],
  },
  {
    id: 'agntcy',
    name: 'AGNTCY ACP (Cisco/LF)',
    description: 'Federated OASF discovery with crypto identity and SLIM encrypted exchange',
    defaultPresetId: 'agntcy-full',
    bundleProviderIds: [['agntcy-oasf', 'agntcy-crypto-identity', 'agntcy-slim']],
  },
  {
    id: 'commerce-acp',
    name: 'Commerce ACP (OpenAI/Stripe)',
    description: 'Cart negotiation, checkout payment, and checkout FSM orchestration',
    defaultPresetId: 'commerce-acp',
    bundleProviderIds: [['commerce-cart-negotiation', 'commerce-checkout', 'commerce-checkout-fsm']],
  },
  {
    id: 'coinbase',
    name: 'Coinbase x402 / AgentKit',
    description: 'x402 USDC payments composed with Coinbase CDP wallet capabilities',
    defaultPresetId: 'a2a-ap2',
    bundleProviderIds: [['x402-usdc', 'coinbase-cdp']],
  },
];

export const PROVIDER_DEPENDENCIES: ProviderDependency[] = [
  {
    id: 'a2a-core-bundle',
    providerIds: ['a2a-agent-card', 'oauth-jwt', 'a2a-task-lifecycle'],
    reason: 'A2A card metadata, identity schemes, and lifecycle orchestration are tightly coupled.',
  },
  {
    id: 'commerce-checkout-bundle',
    providerIds: ['commerce-cart-negotiation', 'commerce-checkout', 'commerce-checkout-fsm'],
    reason: 'Commerce ACP cart negotiation output must feed checkout payment and state machine transitions.',
  },
  {
    id: 'coinbase-payment-bundle',
    providerIds: ['x402-usdc', 'coinbase-cdp'],
    reason: 'x402-USDC payment verification depends on Coinbase CDP wallet operations for execution and settlement.',
  },
];

export interface ProviderInfo {
  id: string;
  layer: ProtocolLayer;
  name: string;
  description: string;
  standard: string;
  phase: number;
}

/**
 * Per-scenario config override.
 * The effective config for a scenario run is:
 *   baseConfig -> overlaid with scenario defaults (from providers[]) -> overlaid with user overrides
 */
export interface ScenarioConfigOverride {
  scenarioId: number;
  config: Partial<ProtocolConfig>;
}
