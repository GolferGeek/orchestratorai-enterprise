import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ListenerRegistryService } from './listener-registry.service';
import { StreamingService } from '../streaming/streaming.service';
import { AmbientEventBusService } from '../event-bus/ambient-event-bus.service';

/**
 * Internal A2A listener — listens to internal agent-to-agent messages within the platform.
 *
 * This is INTERNAL only. External A2A communication is handled by Bridge (port 6600).
 * Pulse listens to internal messages between OrchestratorAI Enterprise products
 * (Forge, Compose, etc.) and triggers workflows based on internal events.
 *
 * The ListenersController exposes a POST /listeners/internal-a2a endpoint that
 * other products can POST to in order to notify Pulse of an internal A2A event.
 *
 * A2A protocol compliance: JSON-RPC 2.0 from @orchestrator-ai/transport-types.
 */
@Injectable()
export class InternalA2AListenerService implements OnModuleInit {
  private readonly logger = new Logger(InternalA2AListenerService.name);
  private readonly LISTENER_ID = 'internal-a2a-listener';

  constructor(
    private readonly registry: ListenerRegistryService,
    private readonly streaming: StreamingService,
    private readonly eventBus: AmbientEventBusService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.LISTENER_ID, 'internal-a2a', 'Internal A2A Message Listener');
    this.registry.activate(this.LISTENER_ID);
    this.logger.log('Internal A2A Listener initialized');
  }

  /**
   * Processes an internal A2A message received via POST /listeners/internal-a2a.
   * Messages must be JSON-RPC 2.0 format per @orchestrator-ai/transport-types.
   * Emits to the event bus so TriggerEvaluatorService can match against triggers.
   */
  processInternalMessage(message: {
    jsonrpc: '2.0';
    method: string;
    params: Record<string, unknown>;
    id?: string;
  }): void {
    this.registry.recordFiring(this.LISTENER_ID);
    this.logger.log(`Internal A2A message received: ${message.method}`);

    this.eventBus.emit({
      sourceType: 'internal-a2a',
      payload: {
        method: message.method,
        id: message.id,
        params: message.params,
      },
      timestamp: new Date().toISOString(),
    });

    this.streaming.emitListenerFired('internal-a2a', message.method, {
      method: message.method,
      id: message.id,
      params: message.params,
    });
  }
}
