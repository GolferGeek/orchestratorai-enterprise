import { Controller, Get, Post, Param, Body, NotFoundException, BadRequestException } from '@nestjs/common';
import { ListenerRegistryService } from './listener-registry.service';
import { DbWatcherService } from './db-watcher.service';
import { FileWatcherService } from './file-watcher.service';
import { InternalA2AListenerService } from './internal-a2a-listener.service';

@Controller('listeners')
export class ListenersController {
  constructor(
    private readonly registry: ListenerRegistryService,
    private readonly dbWatcher: DbWatcherService,
    private readonly fileWatcher: FileWatcherService,
    private readonly internalA2A: InternalA2AListenerService,
  ) {}

  @Get()
  getAll() {
    return this.registry.getAll();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    const listener = this.registry.getById(id);
    if (!listener) {
      throw new NotFoundException(`Listener ${id} not found`);
    }
    return listener;
  }

  /**
   * Simulate a DB event (for development/demo use).
   */
  @Post('simulate/db')
  simulateDb(
    @Body()
    body: {
      table: string;
      eventType: 'INSERT' | 'UPDATE' | 'DELETE';
      payload?: Record<string, unknown>;
    },
  ) {
    this.dbWatcher.simulateEvent(body.table, body.eventType, body.payload ?? {});
    return { accepted: true, table: body.table, eventType: body.eventType };
  }

  /**
   * Simulate a file system event (for development/demo use).
   */
  @Post('simulate/file')
  simulateFile(
    @Body()
    body: {
      path: string;
      eventType: 'created' | 'modified' | 'deleted';
    },
  ) {
    this.fileWatcher.simulateEvent(body.path, body.eventType);
    return { accepted: true, path: body.path, eventType: body.eventType };
  }

  /**
   * Receive an internal A2A message from another product (Forge, Compose, etc.).
   * Message must be JSON-RPC 2.0 format per @orchestrator-ai/transport-types.
   * Emits the event to the ambient event bus for trigger evaluation.
   */
  @Post('internal-a2a')
  receiveInternalA2A(
    @Body()
    body: {
      jsonrpc: '2.0';
      method: string;
      params: Record<string, unknown>;
      id?: string;
    },
  ) {
    if (body.jsonrpc !== '2.0') {
      throw new BadRequestException('Only JSON-RPC 2.0 messages are accepted');
    }
    if (!body.method) {
      throw new BadRequestException('message.method is required');
    }
    if (!body.params || typeof body.params !== 'object') {
      throw new BadRequestException('message.params must be an object');
    }

    this.internalA2A.processInternalMessage(body);
    return { accepted: true, method: body.method, id: body.id ?? null };
  }
}
