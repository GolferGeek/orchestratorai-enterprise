import { useAuthStore } from '@/stores/rbacStore';
import type {
  AgentStreamChunkSSEEvent,
  AgentStreamCompleteSSEEvent,
  AgentStreamErrorSSEEvent,
  SSEConnectionOptions,
  SSEConnectionState,
} from '@orchestrator-ai/transport-types';
import { SSEClient } from './sseClient';
import { getSecureApiBaseUrl } from '@/utils/securityConfig';

type ChunkHandler = (event: AgentStreamChunkSSEEvent['data']) => void;
type CompleteHandler = (event: AgentStreamCompleteSSEEvent['data']) => void;
type ErrorHandler = (event: AgentStreamErrorSSEEvent['data']) => void;
type StateHandler = (state: SSEConnectionState) => void;

interface StreamLifecycleHandlers {
  onChunk?: ChunkHandler;
  onComplete?: CompleteHandler;
  onError?: ErrorHandler;
  onStateChange?: StateHandler;
}

interface ConnectParams extends StreamLifecycleHandlers {
  metadata: Record<string, unknown>;
  connectionOptions?: SSEConnectionOptions;
}

interface NormalizedStreamMetadata {
  streamUrl: string;
  streamTokenUrl: string;
  streamId?: string;
  conversationId?: string | null;
}

const API_BASE_URL = getSecureApiBaseUrl();

export class A2AStreamHandler {
  private client: SSEClient;
  private metadata: NormalizedStreamMetadata | null = null;
  private handlers: StreamLifecycleHandlers = {};
  private authStore = useAuthStore();
  private disposeFns: Array<() => void> = [];

  constructor(defaultOptions?: SSEConnectionOptions) {
    console.log('[A2AStreamHandler] 🔧 Constructing handler with options:', defaultOptions);
    this.client = new SSEClient({ ...defaultOptions, debug: true });
    this.disposeFns.push(
      this.client.onStateChange((state) => {
        console.log('[A2AStreamHandler] 🔄 State changed:', state);
        this.handlers.onStateChange?.(state);
      }),
      this.client.onError((error) => {
        console.error('[A2AStreamHandler] ❌ Stream error:', error);
      }),
    );
  }

  async connect(params: ConnectParams): Promise<void> {
    console.log('[A2AStreamHandler] 🔌 connect() called with metadata:', {
      hasStreamUrl: !!params.metadata?.streamUrl,
      hasStreamTokenUrl: !!params.metadata?.streamTokenUrl,
      streamId: params.metadata?.streamId,
    });

    this.metadata = this.normalizeMetadata(params.metadata);
    console.log('[A2AStreamHandler] 📋 Normalized metadata:', this.metadata);

    this.handlers = {
      onChunk: params.onChunk,
      onComplete: params.onComplete,
      onError: params.onError,
      onStateChange: params.onStateChange,
    };

    this.detachEventListeners();
    this.attachEventListeners();

    this.client.setReconnectUrlProvider(async () => {
      console.log('[A2AStreamHandler] 🔄 Reconnect URL provider called');
      const nextUrl = await this.buildStreamUrl();
      return nextUrl;
    });

    const initialUrl = await this.buildStreamUrl();
    console.log('[A2AStreamHandler] 🔌 Connecting to URL:', initialUrl.replace(/token=[^&]+/, 'token=HIDDEN'));
    await this.client.connect(initialUrl);
  }

  disconnect(): void {
    this.detachEventListeners();
    this.client.disconnect();
    this.handlers = {};
    this.metadata = null;
  }

  getState(): SSEConnectionState {
    return this.client.readyState;
  }

  private attachEventListeners(): void {
    const disposers: Array<() => void> = [];

    disposers.push(
      this.client.addEventListener('agent_stream_chunk', (event) =>
        this.handleChunk(event),
      ),
      this.client.addEventListener('agent_stream_complete', (event) =>
        this.handleComplete(event),
      ),
      this.client.addEventListener('agent_stream_error', (event) =>
        this.handleError(event),
      ),
    );

    this.disposeFns.push(...disposers);
  }

  private detachEventListeners(): void {
    while (this.disposeFns.length) {
      const dispose = this.disposeFns.pop();
      try {
        dispose?.();
      } catch {
        // Error during cleanup - non-critical
      }
    }
  }

  private async buildStreamUrl(): Promise<string> {
    if (!this.metadata) {
      throw new Error('Cannot build stream URL without metadata');
    }

    const token = await this.fetchStreamToken();

    const url = new URL(this.metadata.streamUrl);
    if (this.metadata.streamId) {
      url.searchParams.set('streamId', this.metadata.streamId);
    }
    url.searchParams.set('token', token);

    return url.toString();
  }

  private async fetchStreamToken(): Promise<string> {
    if (!this.metadata) {
      throw new Error('Cannot fetch stream token without metadata');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.authStore.token) {
      headers.Authorization = `Bearer ${this.authStore.token}`;
    }

    const response = await fetch(this.metadata.streamTokenUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(
        this.metadata.streamId ? { streamId: this.metadata.streamId } : {},
      ),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error');
      throw new Error(
        `Failed to fetch stream token: ${response.status} ${errorText}`,
      );
    }

    const payload = await response.json();
    if (!payload?.token) {
      throw new Error('Stream token response missing token');
    }

    return payload.token as string;
  }

  private handleChunk(event: MessageEvent): void {
    console.log('[A2AStreamHandler] 📦 handleChunk called');
    const data = this.safeParse<AgentStreamChunkSSEEvent['data']>(event.data);
    if (!data) {
      console.warn('[A2AStreamHandler] ⚠️ Failed to parse chunk data');
      return;
    }
    console.log('[A2AStreamHandler] 📦 Chunk data:', {
      hasMessage: !!data.chunk.content,
      messageLength: data.chunk.content?.length,
      chunkType: data.chunk.type,
      progress: data.chunk.metadata?.progress,
    });
    this.handlers.onChunk?.(data);
  }

  private handleComplete(event: MessageEvent): void {
    console.log('[A2AStreamHandler] ✅ handleComplete called');
    const data =
      this.safeParse<AgentStreamCompleteSSEEvent['data']>(event.data);
    if (!data) {
      console.warn('[A2AStreamHandler] ⚠️ Failed to parse complete data');
      return;
    }
    console.log('[A2AStreamHandler] ✅ Complete data:', {
      type: data.type,
      streamId: data.streamId,
    });
    this.handlers.onComplete?.(data);
  }

  private handleError(event: MessageEvent): void {
    console.log('[A2AStreamHandler] ❌ handleError called');
    const data = this.safeParse<AgentStreamErrorSSEEvent['data']>(event.data);
    if (!data) {
      console.warn('[A2AStreamHandler] ⚠️ Failed to parse error data');
      return;
    }
    console.error('[A2AStreamHandler] ❌ Error data:', data);
    this.handlers.onError?.(data);
  }

  private safeParse<T>(raw: unknown): T | null {
    if (typeof raw !== 'string') {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private normalizeMetadata(metadata: Record<string, unknown>): NormalizedStreamMetadata {
    const streamingMeta = (metadata.streaming ?? {}) as Record<string, unknown>;

    const streamUrl =
      this.coerceAbsoluteUrl(streamingMeta.streamUrl || metadata.streamUrl) ??
      this.coerceAbsoluteUrl(metadata.streamEndpoint) ??
      (() => {
        throw new Error('Stream metadata did not include a stream URL');
      })();

    const streamTokenUrl =
      this.coerceAbsoluteUrl(
        streamingMeta.streamTokenUrl || metadata.streamTokenUrl,
      ) ??
      this.coerceAbsoluteUrl(metadata.streamTokenEndpoint) ??
      (() => {
        throw new Error('Stream metadata did not include a stream token URL');
      })();

    return {
      streamUrl,
      streamTokenUrl,
      streamId: (streamingMeta.streamId || metadata.streamId) as string | undefined,
      conversationId:
        (streamingMeta.conversationId ||
        metadata.conversationId ||
        metadata.conversation_id) as string | null | undefined || null,
    };
  }

  private coerceAbsoluteUrl(candidate: unknown): string | null {
    if (typeof candidate !== 'string' || candidate.length === 0) {
      return null;
    }

    try {
      return new URL(candidate, API_BASE_URL).toString();
    } catch {
      return null;
    }
  }
}
