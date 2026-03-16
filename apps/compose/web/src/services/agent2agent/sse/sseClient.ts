import type {
  SSEConnectionOptions,
  SSEConnectionState,
} from '@orchestrator-ai/transport-types';

type SSEEventCallback = (event: MessageEvent) => void;
type SSEStateCallback = (state: SSEConnectionState) => void;
type SSEErrorCallback = (error: Event) => void;
type SSEOpenCallback = () => void;
type ReconnectUrlProvider = () => Promise<string> | string;

const DEFAULT_OPTIONS: Required<SSEConnectionOptions> = {
  maxReconnectAttempts: 5,
  reconnectDelay: 2000,
  timeout: 0,
  debug: true, // Enable debug by default for troubleshooting
};

export class SSEClient {
  private readonly options: Required<SSEConnectionOptions>;
  private eventSource: EventSource | null = null;
  private currentUrl: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectUrlProvider?: ReconnectUrlProvider;
  private state: SSEConnectionState = 'disconnected';

  private readonly eventListeners = new Map<string, Set<SSEEventCallback>>();
  private readonly boundListeners = new Map<string, EventListener>();
  private readonly stateListeners = new Set<SSEStateCallback>();
  private readonly errorListeners = new Set<SSEErrorCallback>();
  private readonly openListeners = new Set<SSEOpenCallback>();

  constructor(options: SSEConnectionOptions = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
  }

  get readyState(): SSEConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === 'connected';
  }

  setReconnectUrlProvider(provider: ReconnectUrlProvider) {
    this.reconnectUrlProvider = provider;
  }

  onStateChange(callback: SSEStateCallback): () => void {
    this.stateListeners.add(callback);
    return () => this.stateListeners.delete(callback);
  }

  onError(callback: SSEErrorCallback): () => void {
    this.errorListeners.add(callback);
    return () => this.errorListeners.delete(callback);
  }

  onOpen(callback: SSEOpenCallback): () => void {
    this.openListeners.add(callback);
    return () => this.openListeners.delete(callback);
  }

  addEventListener(eventName: string, handler: SSEEventCallback): () => void {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set());
    }

    const handlers = this.eventListeners.get(eventName)!;
    handlers.add(handler);

    if (this.eventSource && !this.boundListeners.has(eventName)) {
      const listener = (event: Event) =>
        this.emitEvent(eventName, event as MessageEvent);
      this.boundListeners.set(eventName, listener);
      this.eventSource.addEventListener(eventName, listener as EventListener);
    }

    return () => {
      const registered = this.eventListeners.get(eventName);
      if (!registered) return;
      registered.delete(handler);
      if (registered.size === 0) {
        this.eventListeners.delete(eventName);
        const bound = this.boundListeners.get(eventName);
        if (bound && this.eventSource) {
          this.eventSource.removeEventListener(
            eventName,
            bound as EventListener,
          );
        }
        this.boundListeners.delete(eventName);
      }
    };
  }

  async connect(url: string): Promise<void> {
    this.currentUrl = url;
    this.reconnectAttempts = 0;
    this.transitionState('connecting');
    await this.openEventSource(url);
  }

  disconnect(): void {
    this.transitionState('disconnecting');
    this.clearReconnectTimer();
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.boundListeners.clear();
    this.transitionState('disconnected');
  }

  private async openEventSource(url: string): Promise<void> {
    this.debug(`Opening EventSource ${url}`);
    this.cleanupEventSource();

    this.eventSource = new EventSource(url);
    this.registerInternalListeners();
    this.registerCustomEventListeners();
  }

  private registerInternalListeners(): void {
    if (!this.eventSource) return;

    this.eventSource.onopen = () => {
      this.debug('EventSource connected');
      this.reconnectAttempts = 0;
      this.transitionState('connected');
      this.openListeners.forEach((listener) => listener());
    };

    this.eventSource.onerror = (error: Event) => {
      this.debug('EventSource error encountered', error);
      this.errorListeners.forEach((listener) => listener(error));
      this.transitionState('error');

      if (this.options.maxReconnectAttempts === 0) {
        this.debug('Reconnection disabled, disconnecting');
        this.disconnect();
        return;
      }

      if (
        this.options.maxReconnectAttempts > 0 &&
        this.reconnectAttempts >= this.options.maxReconnectAttempts
      ) {
        this.debug('Max reconnection attempts reached, disconnecting');
        this.disconnect();
        return;
      }

      this.scheduleReconnect();
    };
  }

  private registerCustomEventListeners(): void {
    if (!this.eventSource) return;

    this.boundListeners.clear();

    this.eventListeners.forEach((_handlers, eventName) => {
      const listener = (event: Event) =>
        this.emitEvent(eventName, event as MessageEvent);
      this.boundListeners.set(eventName, listener);
      this.eventSource!.addEventListener(eventName, listener as EventListener);
    });
  }

  private emitEvent(eventName: string, event: MessageEvent): void {
    this.debug(`📨 Received event: "${eventName}"`);

    // Parse and log detailed info about the event - for debugging only
    try {
      const parsed = JSON.parse(event.data);
      this.debug(`📨 Event data parsed:`, {
        eventName,
        dataKeys: Object.keys(parsed),
        taskId: parsed.taskId || parsed.task_id,
        status: parsed.status,
        message: parsed.message?.substring(0, 50),
      });
    } catch {
      this.debug(`📨 Failed to parse event data as JSON`);
    }

    const handlers = this.eventListeners.get(eventName);
    if (!handlers || handlers.size === 0) {
      this.debug(`📨 No handlers registered for event "${eventName}"`);
      return;
    }

    this.debug(`📨 Dispatching to ${handlers.size} handler(s)`);
    handlers.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        this.debug(`❌ Error in handler for event "${eventName}"`, error);
      }
    });
  }

  private async scheduleReconnect(): Promise<void> {
    this.clearReconnectTimer();

    this.reconnectAttempts += 1;
    const delay =
      this.options.reconnectDelay * Math.max(this.reconnectAttempts, 1);

    this.debug(
      `Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`,
    );

    this.reconnectTimer = setTimeout(async () => {
      try {
        const nextUrl =
          (await this.getReconnectUrl()) ?? this.currentUrl ?? undefined;

        if (!nextUrl) {
          this.debug('No URL available for reconnection, aborting');
          this.disconnect();
          return;
        }

        this.transitionState('connecting');
        await this.openEventSource(nextUrl);
      } catch (error) {
        this.debug('Reconnect attempt failed', error);
        this.scheduleReconnect();
      }
    }, delay);
  }

  private async getReconnectUrl(): Promise<string | undefined> {
    if (this.reconnectUrlProvider) {
      return await this.reconnectUrlProvider();
    }
    return this.currentUrl ?? undefined;
  }

  private cleanupEventSource(): void {
    if (!this.eventSource) {
      return;
    }

    this.boundListeners.forEach((listener, eventName) => {
      this.eventSource!.removeEventListener(eventName, listener as EventListener);
    });
    this.boundListeners.clear();

    this.eventSource.close();
    this.eventSource = null;
  }

  private transitionState(next: SSEConnectionState): void {
    if (this.state === next) {
      return;
    }
    this.state = next;
    this.stateListeners.forEach((listener) => listener(next));
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private debug(message: string, detail?: unknown): void {
    if (!this.options.debug) {
      return;
    }
    if (detail) {
      console.log(`[SSEClient] ${message}`, detail);
    } else {
      console.log(`[SSEClient] ${message}`);
    }
  }
}
