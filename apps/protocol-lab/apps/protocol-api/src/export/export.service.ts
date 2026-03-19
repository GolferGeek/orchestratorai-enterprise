import { Injectable } from '@nestjs/common';
import { MessagesService } from '../messages/messages.service';
import { ProtocolMessage } from '@agent-communication/shared-types';

export interface ProtocolMetrics {
  totalMessages: number;
  successCount: number;
  errorCount: number;
  averageLatencyMs: number;
  messagesByProtocol: Record<string, number>;
  messagesByAgent: Record<string, number>;
}

export interface ObservabilityEvent {
  type: string;
  timestamp: string;
  source: string;
  target?: string;
  data: Record<string, unknown>;
}

@Injectable()
export class ExportService {
  constructor(private readonly messagesService: MessagesService) {}

  getAllMessages(): ProtocolMessage[] {
    const { messages } = this.messagesService.getMessages({ limit: 100000, offset: 0 });
    return messages;
  }

  getMetrics(): ProtocolMetrics {
    const messages = this.getAllMessages();
    const messagesByProtocol: Record<string, number> = {};
    const messagesByAgent: Record<string, number> = {};

    for (const msg of messages) {
      const proto = msg.protocol.transport;
      messagesByProtocol[proto] = (messagesByProtocol[proto] ?? 0) + 1;
      messagesByAgent[msg.source] = (messagesByAgent[msg.source] ?? 0) + 1;
    }

    const successCount = messages.filter((m) => m.status === 'success').length;
    const errorCount = messages.filter((m) => m.status === 'error').length;
    const latencies = messages
      .filter((m) => m.timing.durationMs !== undefined)
      .map((m) => m.timing.durationMs!);

    return {
      totalMessages: messages.length,
      successCount,
      errorCount,
      averageLatencyMs:
        latencies.length > 0
          ? latencies.reduce((a, b) => a + b, 0) / latencies.length
          : 0,
      messagesByProtocol,
      messagesByAgent,
    };
  }

  getEvents(): ObservabilityEvent[] {
    const messages = this.getAllMessages();
    const events: ObservabilityEvent[] = [];

    for (const msg of messages) {
      events.push({
        type: 'message-sent',
        timestamp: msg.timing.sentAt,
        source: msg.source,
        target: msg.target,
        data: {
          method: msg.method,
          messageId: msg.id,
          transport: msg.protocol.transport,
        },
      });

      if (msg.timing.completedAt) {
        events.push({
          type: `message-${msg.status}`,
          timestamp: msg.timing.completedAt,
          source: msg.target,
          target: msg.source,
          data: {
            method: msg.method,
            messageId: msg.id,
            durationMs: msg.timing.durationMs,
          },
        });
      }
    }

    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return events;
  }

  messagesToCsv(messages: ProtocolMessage[]): string {
    const headers = [
      'id',
      'source',
      'target',
      'method',
      'status',
      'transport',
      'timestamp',
      'durationMs',
    ];
    const rows = messages.map((m) => [
      m.id,
      m.source,
      m.target,
      m.method,
      m.status,
      m.protocol.transport,
      m.timestamp,
      m.timing.durationMs?.toString() ?? '',
    ]);
    return this.buildCsv(headers, rows);
  }

  eventsToCsv(events: ObservabilityEvent[]): string {
    const headers = ['type', 'timestamp', 'source', 'target', 'data'];
    const rows = events.map((e) => [
      e.type,
      e.timestamp,
      e.source,
      e.target ?? '',
      JSON.stringify(e.data),
    ]);
    return this.buildCsv(headers, rows);
  }

  private buildCsv(headers: string[], rows: string[][]): string {
    const lines = [headers.map((h) => this.escapeCsvField(h)).join(',')];
    for (const row of rows) {
      lines.push(row.map((field) => this.escapeCsvField(field)).join(','));
    }
    return lines.join('\n');
  }

  private escapeCsvField(field: string): string {
    if (
      field.includes(',') ||
      field.includes('"') ||
      field.includes('\n') ||
      field.includes('\r')
    ) {
      return '"' + field.replace(/"/g, '""') + '"';
    }
    return field;
  }
}
