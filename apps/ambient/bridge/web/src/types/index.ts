/**
 * Bridge Web Types
 *
 * All types inlined here — Bridge frontend does not depend on @agent-communication/shared-types.
 * Types reflect the external A2A gateway focus of Bridge.
 */

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

export interface AgentCapability {
  id: string;
  name: string;
  description: string;
  pricing?: CapabilityPricing;
}

export interface CapabilityPricing {
  model: 'free' | 'paid' | 'metered';
  amount?: number;
  currency?: string;
}

export interface AgentEndpoint {
  path: string;
  method: string;
  description: string;
  type: string;
  requiresPayment?: boolean;
  requiresAuth?: boolean;
  requiresSignature?: boolean;
}

export interface AgentCard {
  id: string;
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: AgentCapability[];
  endpoints: AgentEndpoint[];
  protocols?: SupportedProtocols;
  security?: Record<string, unknown>;
}

export interface SupportedProtocols {
  discovery?: string[];
  transport?: string[];
  negotiation?: string[];
  identity?: string[];
  payment?: string[];
  wallet?: string[];
  trust?: string[];
  encryption?: string[];
  resilience?: string[];
  observability?: string[];
  orchestration?: string[];
  audit?: string[];
}

export type AgentStatus = 'online' | 'offline' | 'degraded' | 'unknown';

export interface AgentInfo {
  card: AgentCard;
  status: AgentStatus;
  lastHeartbeat: string;
  messagesReceived: number;
  messagesSent: number;
}

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
  config: Partial<ProtocolConfig>;
}

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  layer: ProtocolLayer;
  isDefault?: boolean;
}

export interface ProtocolMessage {
  id: string;
  timestamp: string;
  source: string;
  target: string;
  method: string;
  status: 'pending' | 'success' | 'error' | 'timeout';
  protocol: {
    discovery: string;
    transport: string;
    negotiation: string;
    identity: string;
    payment: string;
    encryption: string;
    trust: string;
  };
  request?: {
    jsonrpc: '2.0';
    id: string;
    method: string;
    params?: Record<string, unknown>;
  };
  response?: {
    jsonrpc: '2.0';
    id: string;
    result?: Record<string, unknown>;
    error?: { code: number; message: string };
  };
  timing?: {
    sentAt: string;
    receivedAt?: string;
    completedAt?: string;
    durationMs?: number;
  };
}

export interface MessageFilter {
  source?: string;
  target?: string;
  method?: string;
  status?: 'pending' | 'success' | 'error' | 'timeout';
  fromTimestamp?: string;
  toTimestamp?: string;
  limit?: number;
  offset?: number;
}

export interface WebSocketEvent {
  type: 'message' | 'agent-status' | 'protocol-change' | 'heartbeat';
  timestamp: string;
  data: Record<string, unknown>;
}

export interface CapabilityOffer {
  agentId: string;
  capabilities: string[];
  protocols: string[];
  pricing?: Record<string, CapabilityPricing>;
}

export interface NegotiationResult {
  accepted: boolean;
  agreedCapabilities: string[];
  agreedProtocol: string;
  rejectedCapabilities?: string[];
  reason?: string;
}

export interface TrustScore {
  agentId: string;
  score: number;
  level: 'trusted' | 'neutral' | 'untrusted' | 'unknown';
  interactions: number;
  lastInteraction?: string;
}

export interface WorkflowStep {
  step: number;
  agentId: string;
  action: string;
  duration: number;
  result: string;
}

export interface Workflow {
  id: string;
  steps: WorkflowStep[];
  createdAt: string;
}

// Runtime values

export const PROTOCOL_LAYERS: readonly ProtocolLayer[] = [
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
];

// SecurityEnvelope — Bridge-specific
export interface SecurityEnvelope {
  nonce: string;
  timestamp: string;
  senderId: string;
  senderPublicKey: string;
  signature: string;
  identityProvider: string;
  replayProtection?: 'passed' | 'rejected' | 'skipped';
  schemaValidation?: 'passed' | 'failed' | 'skipped';
}

export interface TrustInfo {
  agentId: string;
  score: number;
  level: 'trusted' | 'neutral' | 'untrusted' | 'unknown';
  interactions: number;
  lastInteraction?: string;
  provider: string;
}

export interface AuditEntry {
  sequence: number;
  eventType: 'message_sent' | 'message_received' | 'trust_updated' | 'payment_processed' | 'config_changed';
  agentName: string;
  timestamp: string;
  hash: string;
  previousHash: string;
}

// A2A message log row from GET /a2a/messages
export interface A2AMessage {
  id?: string;
  org_slug: string;
  direction: 'inbound' | 'outbound';
  external_agent_id?: string | null;
  method?: string | null;
  request_id?: string | null;
  request_payload?: unknown | null;
  response_payload?: unknown | null;
  status: 'pending' | 'success' | 'error' | 'rejected' | 'rate_limited';
  rejection_reason?: string | null;
  duration_ms?: number | null;
  created_at?: string;
}

// Aggregate stats from GET /a2a/messages/stats
export interface MessageStats {
  total: number;
  inbound: number;
  outbound: number;
  success: number;
  error: number;
  rejected: number;
}

// Query filters for GET /a2a/messages
export interface A2AMessageFilter {
  orgSlug?: string;
  direction?: 'inbound' | 'outbound';
  agentId?: string;
  status?: 'pending' | 'success' | 'error' | 'rejected' | 'rate_limited';
  limit?: number;
}

// External agent from GET /registry/agents (matches ExternalAgentInfo from backend)
export interface ExternalAgent {
  id: string;
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: string[];
  status: 'online' | 'offline' | 'unknown';
  lastSeen: string;
  trustScore: number;
  trustLevel: 'trusted' | 'neutral' | 'untrusted' | 'unknown';
  interactions: number;
  registeredAt: string;
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
