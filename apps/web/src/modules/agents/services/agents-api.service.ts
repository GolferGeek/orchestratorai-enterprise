/**
 * Agents API Service
 *
 * HTTP client for the unified platform Agents API.
 * All async operations flow through this service.
 * ExecutionContext is always passed from the store — never created here.
 *
 * Three-layer architecture:
 *   Component → Store (state only) → Service (async/API) → Agents API
 */

import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import { tokenStorage } from '@/services/tokenStorageService';

const AGENTS_API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * Authenticated fetch wrapper — re-uses the existing token mechanism.
 * Throws on non-OK HTTP responses so callers get real errors, not silent failures.
 */
async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await tokenStorage.getAccessToken();
  if (!token) {
    throw new Error('Authentication is required for the Agents API');
  }
  const currentOrganization = localStorage.getItem('currentOrganization');
  const optionHeaders = new Headers(options.headers);
  if (currentOrganization && !optionHeaders.has('x-organization-slug')) {
    optionHeaders.set('x-organization-slug', currentOrganization);
  }
  if (!optionHeaders.has('Authorization')) {
    optionHeaders.set('Authorization', `Bearer ${token}`);
  }
  if (!optionHeaders.has('Content-Type')) {
    optionHeaders.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${AGENTS_API_BASE_URL}${path}`, {
    ...options,
    headers: optionHeaders,
  });

  if (!response.ok) {
    throw new Error(`Agents API request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

// ============================================================================
// Agent Endpoints
// ============================================================================

export interface AgentDefinition {
  id: string;
  slug: string;
  name: string;
  displayName?: string;
  description?: string;
  agentType: string;
  runners?: AgentRunner[];
  organizationSlug?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Fetch all available agents from the Agents API.
 * Called by agentsService — not directly by components.
 *
 * The API returns { status, agents: [...] } where each agent uses
 * backend field names (id=slug, name=slug, displayName, type).
 * We unwrap and map to the AgentDefinition interface.
 */
async function fetchAgents(orgSlug?: string): Promise<AgentDefinition[]> {
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

export interface AgentRunner {
  id: string;
  name: string;
  description?: string;
  type: 'context' | 'rag' | 'api' | 'external' | 'media';
  configSchema?: Record<string, unknown>;
}

/**
 * Fetch available runners for pipeline composition.
 */
async function fetchRunners(): Promise<AgentRunner[]> {
  return apiFetch<AgentRunner[]>('/runners');
}

// ============================================================================
// Conversation / Message Endpoints
// ============================================================================

export interface SendMessageRequest {
  userMessage: string;
  context: ExecutionContext;
  runners?: string[]; // optional custom pipeline
  attachments?: Array<{ base64: string; mimeType: string; filename: string }>;
  interactionMode?: 'text' | 'voice';
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
 * Send a message to an Agent via the invoke contract.
 * ExecutionContext MUST come from the executionContextStore — never created inline.
 *
 * Endpoint: POST /invoke
 * Request:  { jsonrpc: "2.0", id, method: "invoke", params: { context, data, metadata? } }
 * Response: { jsonrpc: "2.0", id, result: { success, output: { content, outputType }, context? } }
 */
async function sendMessage(
  _agentSlug: string,
  request: SendMessageRequest,
): Promise<SendMessageResponse> {
  if (typeof crypto.randomUUID !== 'function') {
    throw new Error('Secure UUID generation is unavailable');
  }
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
          content: request.attachments?.length
            ? { message: request.userMessage, attachments: request.attachments }
            : request.userMessage,
        },
        metadata: (() => {
          const meta: Record<string, unknown> = {};
          if (request.runners) meta.runners = request.runners;
          if (request.interactionMode)
            meta.interactionMode = request.interactionMode;
          return Object.keys(meta).length > 0 ? meta : undefined;
        })(),
      },
    }),
  });

  if (response.jsonrpc !== '2.0' || response.id !== requestId) {
    throw new Error('Agent invoke response envelope was malformed');
  }

  if (response.error) {
    throw new Error('Agent execution failed');
  }

  const result = response.result;
  if (!result || result.success !== true || !result.output) {
    throw new Error('Agent invoke result was malformed');
  }

  const output = result.output;
  const message =
    typeof output.content === 'string'
      ? output.content
      : JSON.stringify(output.content);

  const metadata = output.metadata as
    SendMessageResponse['metadata'] | undefined;
  if (result.context && !contextsEqual(result.context, request.context)) {
    throw new Error(
      'Agent invoke response attempted to replace ExecutionContext',
    );
  }

  return {
    message,
    outputType: output.outputType,
    context: request.context,
    metadata,
  };
}

function contextsEqual(
  left: ExecutionContext,
  right: ExecutionContext,
): boolean {
  return (
    left.orgSlug === right.orgSlug &&
    left.userId === right.userId &&
    left.conversationId === right.conversationId &&
    left.agentSlug === right.agentSlug &&
    left.agentType === right.agentType &&
    left.provider === right.provider &&
    left.model === right.model &&
    left.sovereignMode === right.sovereignMode &&
    Object.keys(left).length === Object.keys(right).length
  );
}

/**
 * Fetch conversation history for a given conversationId.
 * ExecutionContext MUST come from the executionContextStore.
 */
async function fetchConversationHistory(
  conversationId: string,
  context: ExecutionContext,
): Promise<{ messages: unknown[]; context: ExecutionContext }> {
  return apiFetch<{ messages: unknown[]; context: ExecutionContext }>(
    `/conversations/${conversationId}/history`,
    {
      method: 'POST',
      body: JSON.stringify({ context }),
    },
  );
}

// ============================================================================
// Message History Endpoints
// ============================================================================

export interface ConversationMessageItem {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  outputType?: string;
  metadata?: Record<string, unknown>;
  attachments?: Array<{ filename: string; mimeType: string }> | null;
  createdAt: string;
}

/**
 * Fetch persisted messages for an existing conversation, ordered ASC.
 * Returns an empty array if no messages exist yet.
 */
async function fetchMessages(
  conversationId: string,
): Promise<ConversationMessageItem[]> {
  const response = await apiFetch<{ messages: ConversationMessageItem[] }>(
    `/invoke/conversations/${conversationId}/messages`,
  );
  return response.messages;
}

/**
 * Delete a conversation and all its messages.
 * ON DELETE CASCADE on conversation_messages handles cleanup automatically.
 */
async function deleteConversation(conversationId: string): Promise<void> {
  await apiFetch<{ deleted: boolean }>(
    `/invoke/conversations/${conversationId}`,
    { method: 'DELETE' },
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
  lastActiveAt: string | null;
  messageCount?: number;
  primaryWorkProductType?: string | null;
  primaryWorkProductId?: string | null;
  previewTitle?: string | null;
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

export interface AgentPipeline {
  id: string;
  name: string;
  runners: Array<{
    runnerId: string;
    config?: Record<string, unknown>;
  }>;
  createdAt: string;
}

const PIPELINE_RUNNER_IDS = new Set([
  'context',
  'rag',
  'api',
  'external',
  'media',
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Save a custom runner pipeline.
 * ExecutionContext MUST come from the executionContextStore.
 */
async function savePipeline(
  pipeline: Omit<AgentPipeline, 'id' | 'createdAt'>,
  context: ExecutionContext,
): Promise<AgentPipeline> {
  if (typeof crypto.randomUUID !== 'function') {
    throw new Error('Secure UUID generation is unavailable');
  }
  const requestId = crypto.randomUUID();
  const response = await apiFetch<{
    jsonrpc?: unknown;
    id?: unknown;
    error?: { code?: unknown; message?: unknown };
    result?: {
      success?: unknown;
      output?: { content?: unknown; outputType?: unknown };
      context?: ExecutionContext;
    };
  }>('/pipelines/invoke', {
    method: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      method: 'invoke',
      params: {
        context,
        data: { content: pipeline, contentType: 'json' },
      },
    }),
  });

  if (response.jsonrpc !== '2.0' || response.id !== requestId) {
    throw new Error('Pipeline invoke response envelope was malformed');
  }
  if (response.error) {
    throw new Error('Pipeline save failed');
  }
  const result = response.result;
  if (
    !result ||
    result.success !== true ||
    result.output?.outputType !== 'json'
  ) {
    throw new Error('Pipeline invoke result was malformed');
  }
  if (result.context && !contextsEqual(result.context, context)) {
    throw new Error(
      'Pipeline invoke response attempted to replace ExecutionContext',
    );
  }
  return parseAgentPipeline(result.output.content);
}

/**
 * Fetch saved pipelines for the current user/org.
 * ExecutionContext MUST come from the executionContextStore.
 */
async function fetchPipelines(): Promise<AgentPipeline[]> {
  const pipelines = await apiFetch<unknown>('/pipelines');
  if (!Array.isArray(pipelines)) {
    throw new Error('Pipeline list response was malformed');
  }
  return pipelines.map(parseAgentPipeline);
}

function parseAgentPipeline(value: unknown): AgentPipeline {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['id', 'name', 'runners', 'createdAt'])
  ) {
    throw new Error('Pipeline response was malformed');
  }
  if (
    typeof value.id !== 'string' ||
    !UUID_PATTERN.test(value.id) ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.length > 120 ||
    typeof value.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !Array.isArray(value.runners) ||
    value.runners.length === 0 ||
    value.runners.length > 5
  ) {
    throw new Error('Pipeline response was malformed');
  }

  const seenRunnerIds = new Set<string>();
  const runners = value.runners.map((runner) => {
    if (
      !isRecord(runner) ||
      !hasOnlyKeys(runner, ['runnerId', 'config']) ||
      typeof runner.runnerId !== 'string' ||
      !PIPELINE_RUNNER_IDS.has(runner.runnerId) ||
      seenRunnerIds.has(runner.runnerId) ||
      (runner.config !== undefined && !isRecord(runner.config))
    ) {
      throw new Error('Pipeline response was malformed');
    }
    seenRunnerIds.add(runner.runnerId);
    return {
      runnerId: runner.runnerId,
      ...(runner.config === undefined ? {} : { config: runner.config }),
    };
  });

  return {
    id: value.id,
    name: value.name,
    runners,
    createdAt: value.createdAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

// ============================================================================
// Speech Endpoints
// ============================================================================

/**
 * Transcribe audio to text via Deepgram STT.
 * Sends multipart/form-data — does NOT use apiFetch (which sets Content-Type: application/json).
 */
async function speechTranscribe(audioBlob: Blob): Promise<string> {
  const token = await tokenStorage.getAccessToken();
  if (!token) {
    throw new Error('Authentication is required for speech transcription');
  }

  const formData = new FormData();
  formData.append('audio', audioBlob, 'audio.webm');

  const response = await fetch(`${AGENTS_API_BASE_URL}/speech/transcribe`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData, // multipart — do NOT set Content-Type manually
  });

  if (!response.ok) {
    throw new Error(`Speech transcribe failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    transcript?: unknown;
    confidence?: unknown;
  };
  if (typeof data.transcript !== 'string') {
    throw new Error('Speech transcription response was malformed');
  }
  return data.transcript;
}

/**
 * Synthesize text to speech via ElevenLabs TTS.
 * Returns base64-encoded MP3 audio.
 */
async function speechSynthesize(text: string): Promise<string> {
  const result = await apiFetch<{ audioData?: unknown }>('/speech/synthesize', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
  if (typeof result.audioData !== 'string') {
    throw new Error('Speech synthesis response was malformed');
  }
  return result.audioData;
}

// ============================================================================
// Exported Service Singleton
// ============================================================================

export const agentsApiService = {
  fetchAgents,
  fetchRunners,
  sendMessage,
  fetchConversationHistory,
  fetchConversations,
  fetchMessages,
  deleteConversation,
  savePipeline,
  fetchPipelines,
  speechTranscribe,
  speechSynthesize,
};
