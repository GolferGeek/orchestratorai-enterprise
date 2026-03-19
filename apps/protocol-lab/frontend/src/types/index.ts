import type { ProtocolLayer } from '@agent-communication/shared-types';

export type {
  AgentCard,
  AgentCapability,
  AgentEndpoint,
  AgentInfo,
  AgentStatus,
  SupportedProtocols,
  CapabilityPricing,
  ProtocolConfig,
  ProtocolPreset,
  ProtocolLayer,
  ProviderInfo,
  ProtocolMessage,
  MessageFilter,
  WebSocketEvent,
  CapabilityOffer,
  NegotiationResult,
  TrustScore,
  WorkflowStep,
  Workflow,
} from '@agent-communication/shared-types';

// Runtime values inlined for Vite ESM compatibility (shared-types builds to CJS)

export const PROTOCOL_LAYERS = [
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
] as const;

export const PROTOCOL_PRESETS = [
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
    id: 'standard',
    name: 'Standard',
    description: 'A balanced setup for production-like testing',
    config: {
      discovery: 'well-known',
      transport: 'a2a-jsonrpc',
      negotiation: 'acp',
      identity: 'did',
      payment: 'x402-usdc',
      wallet: 'coinbase-cdp',
      trust: 'reputation',
      encryption: 'envelope',
      resilience: 'circuit-breaker',
      observability: 'file-log',
      orchestration: 'pipeline',
      audit: 'hash-chain',
    },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Maximum security and reliability',
    config: {
      discovery: 'well-known',
      transport: 'grpc',
      negotiation: 'acp',
      identity: 'x509',
      payment: 'stripe-fiat',
      wallet: 'coinbase-cdp',
      trust: 'reputation',
      encryption: 'tls-mutual',
      resilience: 'circuit-breaker',
      observability: 'file-log',
      orchestration: 'pipeline',
      audit: 'hash-chain',
    },
  },
  {
    id: 'crypto-native',
    name: 'Crypto-Native',
    description: 'Web3-focused stack',
    config: {
      discovery: 'well-known',
      transport: 'websocket',
      negotiation: 'auction',
      identity: 'did',
      payment: 'x402-usdc',
      wallet: 'coinbase-cdp',
      trust: 'first-contact',
      encryption: 'envelope',
      resilience: 'retry',
      observability: 'file-log',
      orchestration: 'pipeline',
      audit: 'hash-chain',
    },
  },
  {
    id: 'a2a-full',
    name: 'A2A Full',
    description: 'A2A discovery, negotiation, trust, and lifecycle orchestration',
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
    id: 'a2a-ap2',
    name: 'A2A AP2',
    description: 'A2A + x402 + AgentKit bundle for AP2 commerce flows',
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
    id: 'agntcy-full',
    name: 'AGNTCY Full',
    description: 'AGNTCY OASF discovery, cryptographic identity, and SLIM transport security',
    config: {
      discovery: 'agntcy-oasf',
      transport: 'http-rest',
      negotiation: 'acp',
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
  {
    id: 'commerce-acp',
    name: 'Commerce ACP',
    description: 'Commerce ACP negotiation, checkout payment, and checkout FSM orchestration',
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
];

export interface ResearchCategory {
  id: string;
  name: string;
  description: string;
  articleCount: number;
}

export interface Narrative {
  personality: string;
  title: string;
  content: string;
  generatedAt: string;
}

export interface Article {
  id: string;
  title: string;
  summary: string;
  categoryId: string;
  date: string;
  signalStrength: number;
  author: string;
}

export interface ScoutSignal {
  id: string;
  title: string;
  description: string;
  signalStrength: number;
  category: string;
  detectedAt: string;
  recommendedAction: string;
  source: string;
}

export interface Feed {
  id: string;
  name: string;
  url: string;
  type: 'RSS' | 'API' | 'SCRAPE';
  status: 'active' | 'paused' | 'error';
  lastFetch: string;
  articleCount: number;
}

export interface TrendingTopic {
  id: string;
  topic: string;
  category: string;
  direction: 'rising' | 'stable' | 'declining';
  relevanceScore: number;
  relatedArticleCount: number;
  firstSeen: string;
  lastUpdated: string;
}

export interface QueueItem {
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

export interface Draft {
  id: string;
  title: string;
  status: 'draft' | 'review' | 'published';
  content: string;
  sources: { agentId: string; dataType: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface Topic {
  id: string;
  title: string;
  category: string;
  relevanceScore: number;
  sources: string[];
  createdAt: string;
}

export interface WorkflowExecution {
  id: string;
  topic: string;
  steps: { agentId: string; action: string; duration: number; result: string }[];
  createdAt: string;
}

export interface PaymentTransaction {
  id: string;
  invoiceId: string;
  fromAgent: string;
  toAgent: string;
  amount: number;
  currency: string;
  provider: string;
  transactionHash?: string;
  status: 'pending' | 'verified' | 'failed';
  createdAt: string;
  settledAt?: string;
}

export interface WalletState {
  address: string;
  balance: number;
  currency: string;
  network: string;
  provider: string;
}

export interface TrustInfo {
  agentId: string;
  score: number;
  level: 'trusted' | 'neutral' | 'untrusted' | 'unknown';
  interactions: number;
  lastInteraction?: string;
  provider: string;
}

export interface TrustEvent {
  score: number
  event: string
  timestamp: string
}

export interface SecurityEnvelope {
  nonce: string
  timestamp: string
  senderId: string
  senderPublicKey: string
  signature: string
  identityProvider: string
  replayProtection: 'passed' | 'rejected' | 'skipped'
  schemaValidation: 'passed' | 'failed' | 'skipped'
}

export interface EncryptionInfo {
  algorithm: string
  keyExchange: string
  encrypted: boolean
  originalSize: number
  encryptedSize: number
}

export interface CircuitBreakerState {
  state: 'CLOSED' | 'HALF_OPEN' | 'OPEN'
  failureCount: number
  threshold: number
  cooldownMs: number
  lastFailure: string | null
}

// Mini-Me A2A types
export interface MiniMeSkill {
  id: string;
  name: string;
  description: string;
  examples?: string[];
}

export interface MiniMeAgentCard {
  name: string;
  version: string;
  description: string;
  skills: MiniMeSkill[];
  url?: string;
}

export interface A2APart {
  type: 'text' | 'data';
  text?: string;
  data?: Record<string, unknown>;
  mimeType?: string;
}

export interface A2AMessage {
  messageId: string;
  role: 'user' | 'agent';
  parts: A2APart[];
}

export interface A2AArtifact {
  name: string;
  parts: A2APart[];
}

export interface A2ATaskResult {
  id: string;
  status: {
    state: 'completed' | 'failed';
    message: A2AMessage;
  };
  artifacts?: A2AArtifact[];
}

export interface A2AResponse {
  jsonrpc: '2.0';
  id: number;
  result?: A2ATaskResult;
  error?: { code: number; message: string; data?: unknown };
}

export interface MiniMeInboxRequest {
  id: string;
  timestamp: string;
  from: string;
  subject: string;
  message: string;
  priority: string;
  status: string;
}

export interface MiniMeConversationEntry {
  id: string;
  timestamp: string;
  role: 'user' | 'agent';
  text: string;
  skill?: string;
  artifacts?: A2AArtifact[];
  rawRequest?: unknown;
  rawResponse?: unknown;
}

export const LAYER_COLORS: Record<string, string> = {
  discovery: 'bg-blue-500',
  transport: 'bg-green-500',
  negotiation: 'bg-purple-500',
  identity: 'bg-orange-500',
  payment: 'bg-yellow-500',
  wallet: 'bg-amber-500',
  trust: 'bg-teal-500',
  encryption: 'bg-red-500',
  resilience: 'bg-cyan-500',
  observability: 'bg-pink-500',
  orchestration: 'bg-indigo-500',
  audit: 'bg-emerald-500',
};

export interface AuditEntry {
  sequence: number
  eventType: 'message_sent' | 'message_received' | 'trust_updated' | 'payment_processed' | 'config_changed'
  agentName: string
  timestamp: string
  hash: string
  previousHash: string
}

export const LAYER_TEXT_COLORS: Record<string, string> = {
  discovery: 'text-blue-400',
  transport: 'text-green-400',
  negotiation: 'text-purple-400',
  identity: 'text-orange-400',
  payment: 'text-yellow-400',
  wallet: 'text-amber-400',
  trust: 'text-teal-400',
  encryption: 'text-red-400',
  resilience: 'text-cyan-400',
  observability: 'text-pink-400',
  orchestration: 'text-indigo-400',
  audit: 'text-emerald-400',
};
