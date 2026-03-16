export interface AgentCard {
    id: string;
    name: string;
    description: string;
    url: string;
    version: string;
    capabilities: AgentCapability[];
    endpoints: AgentEndpoint[];
    protocols: SupportedProtocols;
    metadata?: Record<string, unknown>;
}
export interface AgentCapability {
    id: string;
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    pricing?: CapabilityPricing;
}
export interface CapabilityPricing {
    model: 'free' | 'paid' | 'freemium';
    amount?: number;
    currency?: string;
    description?: string;
}
export interface AgentEndpoint {
    path: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    description: string;
    type: 'api' | 'agent';
    requiresPayment: boolean;
}
export interface SupportedProtocols {
    discovery: string[];
    transport: string[];
    negotiation: string[];
    identity: string[];
    payment: string[];
    wallet: string[];
    trust: string[];
    encryption: string[];
    resilience: string[];
    observability: string[];
    orchestration: string[];
}
export type AgentStatus = 'online' | 'offline' | 'degraded';
export interface AgentInfo {
    card: AgentCard;
    status: AgentStatus;
    lastHeartbeat: string;
    messagesReceived: number;
    messagesSent: number;
}
