import { ProvenanceLabel } from './provenance.types';

export interface ProtocolMessage {
  id: string;
  timestamp: string;
  source: string;
  target: string;
  method: string;
  protocol: {
    discovery: string;
    transport: string;
    negotiation: string;
    identity: string;
    payment: string;
    encryption: string;
    trust: string;
  };
  request: {
    jsonrpc: '2.0';
    id: string;
    method: string;
    params?: Record<string, unknown>;
  };
  response?: {
    jsonrpc: '2.0';
    id: string;
    result?: Record<string, unknown>;
    error?: {
      code: number;
      message: string;
      data?: unknown;
    };
  };
  timing: {
    sentAt: string;
    receivedAt?: string;
    completedAt?: string;
    durationMs?: number;
  };
  payment?: {
    required: boolean;
    amount?: number;
    currency?: string;
    status?: 'pending' | 'paid' | 'failed' | 'free';
    transactionHash?: string;
  };
  status: 'pending' | 'success' | 'error' | 'timeout';
  provenance?: ProvenanceLabel;
}

export interface MessageFilter {
  source?: string;
  target?: string;
  method?: string;
  status?: ProtocolMessage['status'];
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
