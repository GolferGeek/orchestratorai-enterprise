/**
 * The workflow runtime's HTTP surface for the web kit: invoke (JSON-RPC),
 * run reads, events, trace, issues, and the stream token. Every mutation goes
 * through POST /workflows/invoke with the whole ExecutionContext.
 */
import type {
  ExecutionContext,
  IssueLedgerView,
  JsonValue,
  ParticipantDetail,
  RunTrace,
  WorkflowInvokeAction,
  WorkflowInvokeResult,
  WorkflowRunView,
} from '@orchestrator-ai/transport-types';
import { API_BASE_URL, apiFetch } from '@/modules/workflows/services/workflows-api.service';

interface InvokeResponse {
  result?: { success: boolean; output: { content: WorkflowInvokeResult }; context?: ExecutionContext };
  error?: { code: number; message: string };
}

/** One live event from the workflow stream. */
export interface WorkflowStreamEvent {
  hook_event_type: string;
  status: string;
  message: string | null;
  step: string | null;
  progress: number | null;
  timestamp: number;
  payload: Record<string, JsonValue>;
  context: ExecutionContext;
}

function sameContext(a: ExecutionContext, b: ExecutionContext): boolean {
  const keys: Array<keyof ExecutionContext> = [
    'orgSlug', 'userId', 'conversationId', 'agentSlug', 'agentType', 'provider', 'model', 'sovereignMode',
  ];
  return keys.every((key) => a[key] === b[key]);
}

async function invoke(context: ExecutionContext, action: WorkflowInvokeAction): Promise<WorkflowInvokeResult> {
  const response = await apiFetch<InvokeResponse>('/workflows/invoke', {
    method: 'POST',
    headers: { 'x-organization-slug': context.orgSlug },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'invoke',
      params: { context, data: { contentType: 'json', content: action } },
    }),
  });
  if (response.error) throw new Error(response.error.message);
  if (!response.result) throw new Error('The workflow invoke returned neither a result nor an error');
  // The capsule must come back exactly as sent: anything else is a bug upstream.
  if (!response.result.context || !sameContext(response.result.context, context)) {
    throw new Error('The workflow invoke returned a different ExecutionContext than it was sent');
  }
  return response.result.output.content;
}

function runPath(slug: string, runId: string): string {
  return `/workflows/${encodeURIComponent(slug)}/runs/${encodeURIComponent(runId)}`;
}

export const workflowRunsClient = {
  invoke,
  getRun: (slug: string, runId: string, org: string) =>
    apiFetch<WorkflowRunView>(runPath(slug, runId), { headers: { 'x-organization-slug': org } }),
  getEvents: async (slug: string, runId: string, org: string) =>
    (
      await apiFetch<{ events: WorkflowStreamEvent[] }>(`${runPath(slug, runId)}/events`, {
        headers: { 'x-organization-slug': org },
      })
    ).events,
  getTrace: (slug: string, runId: string, org: string) =>
    apiFetch<RunTrace>(`${runPath(slug, runId)}/trace`, { headers: { 'x-organization-slug': org } }),
  getIssues: (slug: string, runId: string, org: string) =>
    apiFetch<IssueLedgerView>(`${runPath(slug, runId)}/issues`, { headers: { 'x-organization-slug': org } }),
  getParticipant: (slug: string, runId: string, participantId: string, org: string) =>
    apiFetch<ParticipantDetail>(`${runPath(slug, runId)}/trace/participants/${encodeURIComponent(participantId)}`, {
      headers: { 'x-organization-slug': org },
    }),
  /** URL of the run's event stream (EventSource cannot send headers, so it takes a token). */
  streamUrl: async (context: ExecutionContext): Promise<string> => {
    const { token } = await apiFetch<{ token: string }>('/workflows/stream-token', {
      method: 'POST',
      headers: { 'x-organization-slug': context.orgSlug },
      body: JSON.stringify({ context }),
    });
    return `${API_BASE_URL}/workflows/stream?conversationId=${encodeURIComponent(context.conversationId)}&token=${encodeURIComponent(token)}`;
  },
};
