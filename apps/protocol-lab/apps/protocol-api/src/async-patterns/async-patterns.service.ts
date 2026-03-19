import { Injectable, Logger } from '@nestjs/common';
import {
  getAuthHeadersAsync,
  CallbackCorrelationService,
} from '@agent-communication/shared-protocols';
import { MessagesService } from '../messages/messages.service';
import { ProtocolMessage } from '@agent-communication/shared-types';
import { randomUUID } from 'crypto';

const RESEARCH_HUB_URL = 'http://localhost:6403';
const MARKET_PULSE_URL = 'http://localhost:6404';
const CONTENT_FORGE_URL = 'http://localhost:6405';

export interface FireAndForgetResult {
  status: 'accepted';
  message: string;
  dispatchedAt: string;
}

export interface RequestResponseResult {
  topic: string;
  narrative: string | null;
  relatedArticles: unknown[];
  relatedCategories: unknown[];
  relatedSignals: unknown[];
  analyzedAt: string;
  roundTripMs: number;
}

export interface CallbackTaskResult {
  taskId: string;
  status: 'accepted';
  message: string;
  submittedAt: string;
}

export interface TaskStatusResult {
  taskId: string;
  status: 'pending' | 'complete';
  result?: unknown;
}

export interface PollingTaskResult {
  taskId: string;
  status: 'accepted';
  message: string;
  submittedAt: string;
}

export interface StreamEvent {
  type: 'data' | 'done' | 'error';
  chunk?: string;
  tokenCount?: number;
  message?: string;
}

function defaultProtocol(): ProtocolMessage['protocol'] {
  return {
    discovery: 'well-known',
    transport: 'http-rest',
    negotiation: 'capability-card',
    identity: 'local-keys',
    payment: 'mock',
    encryption: 'none',
    trust: 'allowlist',
  };
}

function buildMessage(
  partial: Pick<ProtocolMessage, 'id' | 'source' | 'target' | 'method' | 'status'> & {
    sentAt: string;
    params?: Record<string, unknown>;
    responseData?: unknown;
    durationMs?: number;
  },
): ProtocolMessage {
  const now = new Date().toISOString();
  const msg: ProtocolMessage = {
    id: partial.id,
    timestamp: partial.sentAt,
    source: partial.source,
    target: partial.target,
    method: partial.method,
    status: partial.status,
    protocol: defaultProtocol(),
    request: {
      jsonrpc: '2.0',
      id: partial.id,
      method: partial.method,
      params: partial.params ?? {},
    },
    timing: {
      sentAt: partial.sentAt,
      receivedAt: partial.sentAt,
      completedAt: partial.durationMs !== undefined ? now : undefined,
      durationMs: partial.durationMs,
    },
  };

  if (partial.responseData !== undefined) {
    const data = partial.responseData;
    if (partial.status === 'success') {
      const sanitized = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : { content: String(data) };
      msg.response = { jsonrpc: '2.0', id: partial.id, result: sanitized };
    } else {
      msg.response = {
        jsonrpc: '2.0',
        id: partial.id,
        error: { code: -32000, message: String(data) },
      };
    }
  }

  return msg;
}

@Injectable()
export class AsyncPatternsService {
  private readonly logger = new Logger(AsyncPatternsService.name);
  private readonly taskStore = new Map<string, TaskStatusResult>();
  private readonly callbackCorrelation = new CallbackCorrelationService();

  constructor(private readonly messagesService: MessagesService) {}

  async fireAndForget(): Promise<FireAndForgetResult> {
    const sentAt = new Date().toISOString();
    const messageId = `faf-${randomUUID().slice(0, 8)}`;

    this.messagesService.recordMessage(
      buildMessage({
        id: messageId,
        source: 'protocol-api',
        target: 'market-pulse',
        method: 'agent.scan',
        status: 'pending',
        sentAt,
        params: { pattern: 'fire-and-forget' },
      }),
    );

    // Dispatch without awaiting — true fire-and-forget
    this.dispatchToMarketPulse(messageId, sentAt).catch((err: Error) => {
      this.logger.warn(`Fire-and-forget dispatch completed with error: ${err.message}`);
    });

    return {
      status: 'accepted',
      message: 'Signal dispatched to MarketPulse /agent/scan. No acknowledgment expected. Protocol-API returned 202 immediately.',
      dispatchedAt: sentAt,
    };
  }

  private async dispatchToMarketPulse(messageId: string, sentAt: string): Promise<void> {
    const startMs = Date.now();
    const headers = await getAuthHeadersAsync();
    const response = await fetch(`${MARKET_PULSE_URL}/agent/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
    });

    const result = (await response.json()) as unknown;
    const durationMs = Date.now() - startMs;

    this.messagesService.recordMessage(
      buildMessage({
        id: `${messageId}-resp`,
        source: 'market-pulse',
        target: 'protocol-api',
        method: 'agent.scan',
        status: response.ok ? 'success' : 'error',
        sentAt,
        responseData: result,
        durationMs,
      }),
    );
  }

  async requestResponse(): Promise<RequestResponseResult> {
    const startMs = Date.now();
    const sentAt = new Date().toISOString();
    const requestId = `rr-${randomUUID().slice(0, 8)}`;

    this.messagesService.recordMessage(
      buildMessage({
        id: requestId,
        source: 'protocol-api',
        target: 'research-hub',
        method: 'agent.analyze',
        status: 'pending',
        sentAt,
        params: { topic: 'agent communication patterns', pattern: 'request-response' },
      }),
    );

    const headers = await getAuthHeadersAsync();
    const response = await fetch(`${RESEARCH_HUB_URL}/agent/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ topic: 'agent communication patterns' }),
    });

    if (!response.ok) {
      throw new Error(`ResearchHub /agent/analyze returned ${response.status}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const roundTripMs = Date.now() - startMs;

    this.messagesService.recordMessage(
      buildMessage({
        id: `${requestId}-resp`,
        source: 'research-hub',
        target: 'protocol-api',
        method: 'agent.analyze',
        status: 'success',
        sentAt,
        responseData: data,
        durationMs: roundTripMs,
      }),
    );

    return {
      topic: (data['topic'] as string) ?? 'agent communication patterns',
      narrative: (data['narrative'] as string | null) ?? null,
      relatedArticles: (data['relatedArticles'] as unknown[]) ?? [],
      relatedCategories: (data['relatedCategories'] as unknown[]) ?? [],
      relatedSignals: (data['relatedSignals'] as unknown[]) ?? [],
      analyzedAt: (data['analyzedAt'] as string) ?? new Date().toISOString(),
      roundTripMs,
    };
  }

  async submitCallbackTask(callbackId: string): Promise<CallbackTaskResult> {
    const taskId = callbackId || `cb-${randomUUID().slice(0, 8)}`;
    const submittedAt = new Date().toISOString();

    // Initiate callback lifecycle tracking — generates correlationId and records state
    const cbRecord = this.callbackCorrelation.initiate();
    const { correlationId } = cbRecord;

    this.taskStore.set(taskId, { taskId, status: 'pending' });

    this.messagesService.recordMessage(
      buildMessage({
        id: `cb-submit-${taskId}`,
        source: 'protocol-api',
        target: 'content-forge',
        method: 'workflow.execute',
        status: 'pending',
        sentAt: submittedAt,
        params: { topic: 'async callback pattern', callbackId: taskId, correlationId },
      }),
    );

    // Execute async — stores result when ContentForge responds, simulating a callback delivery
    this.executeCallbackTask(taskId, correlationId, submittedAt).catch((err: Error) => {
      this.logger.error(`Callback task ${taskId} (correlationId: ${correlationId}) failed: ${err.message}`);
      this.callbackCorrelation.fail(correlationId, err.message);
      this.taskStore.set(taskId, { taskId, status: 'complete', result: { error: err.message } });
    });

    return {
      taskId,
      status: 'accepted',
      message: 'Task submitted to ContentForge /api/workflow/execute. Result stored when processing completes.',
      submittedAt,
    };
  }

  private async executeCallbackTask(taskId: string, correlationId: string, submittedAt: string): Promise<void> {
    const startMs = Date.now();

    // Mark as sent before making the call
    this.callbackCorrelation.markSent(correlationId);

    const headers = await getAuthHeadersAsync();
    const response = await fetch(`${CONTENT_FORGE_URL}/api/workflow/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ topic: 'async callback pattern', correlationId }),
    });

    if (!response.ok) {
      throw new Error(`ContentForge /api/workflow/execute returned ${response.status}`);
    }

    const result = (await response.json()) as unknown;
    const durationMs = Date.now() - startMs;

    // Record the callback receipt with the real artifact
    this.callbackCorrelation.receiveCallback(correlationId, result);

    // Gate: require the artifact before marking the task as successfully complete
    this.callbackCorrelation.requireArtifact(correlationId);

    // Advance to verified — all checks passed
    this.callbackCorrelation.verify(correlationId);

    this.taskStore.set(taskId, { taskId, status: 'complete', result });

    this.messagesService.recordMessage(
      buildMessage({
        id: `cb-complete-${taskId}`,
        source: 'content-forge',
        target: 'protocol-api',
        method: 'workflow.execute',
        status: 'success',
        sentAt: submittedAt,
        responseData: result,
        durationMs,
      }),
    );
  }

  getCallbackResult(taskId: string): TaskStatusResult {
    const stored = this.taskStore.get(taskId);
    if (!stored) {
      return { taskId, status: 'pending' };
    }
    return stored;
  }

  async submitPollingTask(): Promise<PollingTaskResult> {
    const taskId = `poll-${randomUUID().slice(0, 8)}`;
    const submittedAt = new Date().toISOString();

    this.taskStore.set(taskId, { taskId, status: 'pending' });

    this.messagesService.recordMessage(
      buildMessage({
        id: `poll-submit-${taskId}`,
        source: 'protocol-api',
        target: 'content-forge',
        method: 'agent.draft',
        status: 'pending',
        sentAt: submittedAt,
        params: { topic: 'async polling pattern' },
      }),
    );

    this.executePollingTask(taskId, submittedAt).catch((err: Error) => {
      this.logger.error(`Polling task ${taskId} failed: ${err.message}`);
      this.taskStore.set(taskId, { taskId, status: 'complete', result: { error: err.message } });
    });

    return {
      taskId,
      status: 'accepted',
      message: 'Task submitted to ContentForge /agent/draft. Poll GET /polling/:taskId for status.',
      submittedAt,
    };
  }

  private async executePollingTask(taskId: string, submittedAt: string): Promise<void> {
    const startMs = Date.now();
    const headers = await getAuthHeadersAsync();
    const response = await fetch(`${CONTENT_FORGE_URL}/agent/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ topic: 'async polling pattern' }),
    });

    if (!response.ok) {
      throw new Error(`ContentForge /agent/draft returned ${response.status}`);
    }

    const result = (await response.json()) as unknown;
    const durationMs = Date.now() - startMs;

    this.taskStore.set(taskId, { taskId, status: 'complete', result });

    this.messagesService.recordMessage(
      buildMessage({
        id: `poll-complete-${taskId}`,
        source: 'content-forge',
        target: 'protocol-api',
        method: 'agent.draft',
        status: 'success',
        sentAt: submittedAt,
        responseData: result,
        durationMs,
      }),
    );
  }

  getPollingStatus(taskId: string): TaskStatusResult {
    const stored = this.taskStore.get(taskId);
    if (!stored) {
      return { taskId, status: 'pending' };
    }
    return stored;
  }

  async *streamResearch(): AsyncGenerator<StreamEvent> {
    const sentAt = new Date().toISOString();
    const requestId = `stream-${randomUUID().slice(0, 8)}`;

    this.messagesService.recordMessage(
      buildMessage({
        id: requestId,
        source: 'protocol-api',
        target: 'research-hub',
        method: 'agent.analyze',
        status: 'pending',
        sentAt,
        params: { topic: 'streaming data patterns', pattern: 'streaming' },
      }),
    );

    const headers = await getAuthHeadersAsync();
    const response = await fetch(`${RESEARCH_HUB_URL}/agent/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ topic: 'streaming data patterns' }),
    });

    if (!response.ok) {
      yield { type: 'error', message: `ResearchHub /agent/analyze returned ${response.status}` };
      return;
    }

    const data = (await response.json()) as { narrative?: string; relatedArticles?: unknown[] };

    // Split the response into chunks to demonstrate SSE streaming
    const chunks: string[] = [
      data.narrative
        ? `[Research narrative] ${data.narrative}`
        : '[Research narrative] Streaming analysis of agent communication patterns.',
      `[Articles indexed] ${Array.isArray(data.relatedArticles) ? data.relatedArticles.length : 0} related articles found.`,
      '[Stream complete] All research segments delivered to ContentForge.',
    ];

    for (const chunk of chunks) {
      yield { type: 'data', chunk };
      await new Promise<void>((resolve) => setTimeout(resolve, 300));
    }

    const wordCount = chunks.join(' ').split(/\s+/).length;
    yield { type: 'done', tokenCount: wordCount };

    this.messagesService.recordMessage(
      buildMessage({
        id: `${requestId}-resp`,
        source: 'research-hub',
        target: 'protocol-api',
        method: 'agent.analyze',
        status: 'success',
        sentAt,
        responseData: data,
        durationMs: 0,
      }),
    );
  }
}
