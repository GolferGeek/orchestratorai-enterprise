/**
 * Compose API Service
 *
 * HTTP client for the Compose API on port 6300.
 * All async operations flow through this service.
 * ExecutionContext is always passed from the store — never created here.
 *
 * Three-layer architecture:
 *   Component → Store (state only) → Service (async/API) → Compose API
 */

import type { ExecutionContext } from '@orchestrator-ai/transport-types';

// Use relative URLs so requests go through the Vite proxy (which handles auth and CORS).
// Only fall back to a direct URL if explicitly configured.
const COMPOSE_API_BASE_URL = import.meta.env.VITE_COMPOSE_API_BASE_URL || '';

/**
 * Authenticated fetch wrapper — re-uses the existing token mechanism.
 * Throws on non-OK HTTP responses so callers get real errors, not silent failures.
 */
async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token =
    localStorage.getItem('authToken') ||
    localStorage.getItem('auth_token') ||
    '';

  const response = await fetch(`${COMPOSE_API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Compose API error ${response.status} ${response.statusText}: ${body}`
    );
  }

  return response.json() as Promise<T>;
}

// ============================================================================
// Agent Endpoints
// ============================================================================

export interface ComposeAgent {
  id: string;
  slug: string;
  name: string;
  displayName?: string;
  description?: string;
  agentType: string;
  runners?: ComposeRunner[];
  organizationSlug?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Fetch all available agents from the Compose API.
 * Called by agentsService — not directly by components.
 *
 * The API returns { status, agents: [...] } where each agent uses
 * backend field names (id=slug, name=slug, displayName, type).
 * We unwrap and map to the ComposeAgent interface.
 */
async function fetchAgents(orgSlug?: string): Promise<ComposeAgent[]> {
  const headers: Record<string, string> = {};
  if (orgSlug) {
    headers['x-organization-slug'] = orgSlug;
  }

  const response = await apiFetch<{
    status: string;
    agents: Array<{
      id: string;
      name: string;
      displayName?: string;
      type: string;
      description?: string;
      organizationSlug?: string | null;
      metadata?: Record<string, unknown>;
    }>;
  }>('/invoke/agents', { headers });

  return response.agents.map((agent) => ({
    id: agent.id,
    slug: agent.id, // API returns slug as "id"
    name: agent.displayName || agent.name,
    displayName: agent.displayName,
    description: agent.description,
    agentType: agent.type,
    organizationSlug: agent.organizationSlug,
    metadata: agent.metadata,
  }));
}

// ============================================================================
// Runner Endpoints
// ============================================================================

export interface ComposeRunner {
  id: string;
  name: string;
  description?: string;
  type: 'context' | 'rag' | 'api' | 'external' | 'media';
  configSchema?: Record<string, unknown>;
}

/**
 * Fetch available runners for pipeline composition.
 */
async function fetchRunners(): Promise<ComposeRunner[]> {
  return apiFetch<ComposeRunner[]>('/runners');
}

// ============================================================================
// Conversation / Message Endpoints
// ============================================================================

export interface SendMessageRequest {
  userMessage: string;
  context: ExecutionContext;
  runners?: string[]; // optional custom pipeline
}

export interface SendMessageResponse {
  message: string;
  outputType?: string;
  context: ExecutionContext;
  metadata?: {
    provider?: string;
    model?: string;
    tokensUsed?: number;
    runnerChain?: string[];
  };
}

/**
 * Send a message to a Compose agent via the invoke contract.
 * ExecutionContext MUST come from the executionContextStore — never created inline.
 *
 * Endpoint: POST /invoke
 * Request:  { jsonrpc: "2.0", id, method: "invoke", params: { context, data, metadata? } }
 * Response: { jsonrpc: "2.0", id, result: { success, output: { content, outputType }, context? } }
 */
async function sendMessage(
  _agentSlug: string,
  request: SendMessageRequest
): Promise<SendMessageResponse> {
  const requestId = crypto.randomUUID();

  const response = await apiFetch<{
    jsonrpc: string;
    id: string;
    error?: {
      code: number;
      message: string;
      data?: Record<string, unknown>;
    };
    result?: {
      success: boolean;
      output: {
        content: string;
        outputType?: string;
        metadata?: Record<string, unknown>;
      };
      context?: ExecutionContext;
    };
  }>('/invoke', {
    method: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      method: 'invoke',
      params: {
        context: request.context,
        data: {
          content: request.userMessage,
        },
        metadata: request.runners ? { runners: request.runners } : undefined,
      },
    }),
  });

  if (response.error) {
    throw new Error(response.error.message || 'Agent execution failed');
  }

  const result = response.result;
  if (!result) {
    throw new Error('No result in invoke response');
  }

  const output = result.output;
  const message = typeof output.content === 'string'
    ? output.content
    : JSON.stringify(output.content);

  const metadata = output.metadata as SendMessageResponse['metadata'] | undefined;
  const updatedContext = result.context ?? request.context;

  return { message, outputType: output.outputType, context: updatedContext, metadata };
}

/**
 * Fetch conversation history for a given conversationId.
 * ExecutionContext MUST come from the executionContextStore.
 */
async function fetchConversationHistory(
  conversationId: string,
  context: ExecutionContext
): Promise<{ messages: unknown[]; context: ExecutionContext }> {
  return apiFetch<{ messages: unknown[]; context: ExecutionContext }>(
    `/conversations/${conversationId}/history`,
    {
      method: 'POST',
      body: JSON.stringify({ context }),
    }
  );
}

// ============================================================================
// Conversations Nav Endpoints
// ============================================================================

export interface ConversationNavItem {
  id: string;
  agentName: string;
  agentType: string;
  organizationSlug: string;
  startedAt: string;
  lastActiveAt: string;
  messageCount: number;
}

/**
 * Fetch all conversations for the current user (for the sidebar nav).
 * User is identified from the JWT token — no user_id in the URL.
 */
async function fetchConversations(): Promise<ConversationNavItem[]> {
  const response = await apiFetch<{ conversations: ConversationNavItem[] }>(
    '/invoke/conversations',
  );
  return response.conversations;
}

// ============================================================================
// Pipeline Endpoints
// ============================================================================

export interface ComposePipeline {
  id: string;
  name: string;
  runners: Array<{
    runnerId: string;
    config?: Record<string, unknown>;
  }>;
  createdAt: string;
}

/**
 * Save a custom runner pipeline.
 * ExecutionContext MUST come from the executionContextStore.
 */
async function savePipeline(
  pipeline: Omit<ComposePipeline, 'id' | 'createdAt'>,
  context: ExecutionContext
): Promise<ComposePipeline> {
  return apiFetch<ComposePipeline>('/pipelines', {
    method: 'POST',
    body: JSON.stringify({ pipeline, context }),
  });
}

/**
 * Fetch saved pipelines for the current user/org.
 * ExecutionContext MUST come from the executionContextStore.
 */
async function fetchPipelines(context: ExecutionContext): Promise<ComposePipeline[]> {
  return apiFetch<ComposePipeline[]>(
    `/pipelines?orgSlug=${encodeURIComponent(context.orgSlug)}&userId=${encodeURIComponent(context.userId)}`
  );
}

// ============================================================================
// Exported Service Singleton
// ============================================================================

export const composeApiService = {
  fetchAgents,
  fetchRunners,
  sendMessage,
  fetchConversationHistory,
  fetchConversations,
  savePipeline,
  fetchPipelines,
};
