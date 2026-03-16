import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { ProtocolMessage, MessageFilter } from '@agent-communication/shared-types';
import { WsService } from '../ws/ws.service';

@Injectable()
export class MessagesService implements OnModuleInit {
  private readonly logger = new Logger(MessagesService.name);
  private messages: ProtocolMessage[] = [];
  private readonly dataFilePath: string;

  constructor(private readonly wsService: WsService) {
    this.dataFilePath = join(process.cwd(), 'data/messages.json');
  }

  onModuleInit() {
    const dir = join(process.cwd(), 'data');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (existsSync(this.dataFilePath)) {
      const raw = readFileSync(this.dataFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.messages = parsed;
        this.logger.log(`Loaded ${this.messages.length} messages from disk`);
      }
    }
  }

  recordMessage(message: ProtocolMessage): ProtocolMessage {
    this.messages.push(message);
    this.logger.log(
      `Message recorded: ${message.id} [${message.source} -> ${message.target}] ${message.method}`,
    );

    this.wsService.broadcastMessage({
      messageId: message.id,
      source: message.source,
      target: message.target,
      method: message.method,
      status: message.status,
      timestamp: message.timestamp,
    });

    this.persistMessages();

    return message;
  }

  getMessages(filter: MessageFilter): { messages: ProtocolMessage[]; total: number } {
    let filtered = [...this.messages];

    if (filter.source) {
      filtered = filtered.filter((m) => m.source === filter.source);
    }
    if (filter.target) {
      filtered = filtered.filter((m) => m.target === filter.target);
    }
    if (filter.method) {
      filtered = filtered.filter((m) => m.method === filter.method);
    }
    if (filter.status) {
      filtered = filtered.filter((m) => m.status === filter.status);
    }
    if (filter.fromTimestamp) {
      filtered = filtered.filter((m) => m.timestamp >= filter.fromTimestamp!);
    }
    if (filter.toTimestamp) {
      filtered = filtered.filter((m) => m.timestamp <= filter.toTimestamp!);
    }

    // Sort by timestamp descending (newest first)
    filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const total = filtered.length;
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 50;
    const paginated = filtered.slice(offset, offset + limit);

    return { messages: paginated, total };
  }

  getMessage(id: string): ProtocolMessage | undefined {
    return this.messages.find((m) => m.id === id);
  }

  private persistMessages(): void {
    try {
      writeFileSync(this.dataFilePath, JSON.stringify(this.messages, null, 2));
    } catch (err) {
      this.logger.error(`Failed to persist messages: ${err}`);
    }
  }
}
