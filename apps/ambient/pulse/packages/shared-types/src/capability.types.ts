export interface CapabilityOffer {
  agentId: string;
  capabilities: string[];
  protocols: string[];
  pricing: Record<string, { model: 'free' | 'paid'; amount?: number; currency?: string }>;
}

export interface NegotiationResult {
  status: 'agreed' | 'rejected' | 'counter-offer';
  agreedCapabilities?: string[];
  agreedProtocol?: string;
  reason?: string;
  counterOffer?: CapabilityOffer;
}

export interface TrustScore {
  agentId: string;
  score: number;
  level: 'trusted' | 'neutral' | 'untrusted' | 'unknown';
  interactions: number;
  lastInteraction?: string;
}

export interface WorkflowStep {
  id: string;
  agentId: string;
  task: string;
  params?: Record<string, unknown>;
  dependsOn?: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
}

export interface Workflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
}
