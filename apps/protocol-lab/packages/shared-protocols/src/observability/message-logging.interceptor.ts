import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { Request } from 'express';
import { randomUUID } from 'crypto';
import { ProtocolMessage } from '@agent-communication/shared-types';
import { getAuthHeaders } from '../auth/agent-token.service';

/**
 * Intercepts incoming /agent/* requests and logs them to the Protocol API's
 * observability message store. This bridges the gap between direct HTTP calls
 * and the centralized message log that powers the Observability UI.
 *
 * Each intercepted request generates a ProtocolMessage with:
 * - Source/target agent identification
 * - Full JSON-RPC request/response
 * - Security envelope from request headers (if present)
 * - Timing data (sentAt, completedAt, durationMs)
 * - Active protocol stack configuration
 *
 * Messages are sent fire-and-forget to avoid impacting request latency.
 */
@Injectable()
export class MessageLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('MessageLogging');
  private readonly protocolApiUrl: string;
  private readonly agentId: string;

  constructor(agentId: string, protocolApiPort = 6402) {
    this.agentId = agentId;
    this.protocolApiUrl = `http://localhost:${protocolApiPort}`;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();

    // Only log /agent/* endpoints — skip health, well-known, API, etc.
    if (!req.path.startsWith('/agent')) {
      return next.handle();
    }

    const startTime = Date.now();
    const messageId = `msg-${randomUUID().slice(0, 8)}`;
    const method = this.extractMethod(req);
    const source = this.extractSource(req);

    return next.handle().pipe(
      tap((responseData) => {
        const durationMs = Date.now() - startTime;
        this.logMessage(messageId, source, method, req, responseData, durationMs, 'success');
      }),
      catchError((error) => {
        const durationMs = Date.now() - startTime;
        this.logMessage(messageId, source, method, req, { error: error.message }, durationMs, 'error');
        return throwError(() => error);
      }),
    );
  }

  private extractMethod(req: Request): string {
    // Convert /agent/analyze -> analyze, /agent/narrative/pragmatist -> narrative/pragmatist
    const agentPath = req.path.replace(/^\/agent\/?/, '');
    return agentPath || 'unknown';
  }

  private extractSource(req: Request): string {
    // Try to identify the calling agent from headers or referer
    const sourceHeader = req.headers['x-agent-source'] as string;
    if (sourceHeader) return sourceHeader;

    // Try to infer from referer or user-agent
    const referer = req.headers['referer'] as string;
    if (referer) {
      if (referer.includes(':6403')) return 'research-hub';
      if (referer.includes(':6404')) return 'market-pulse';
      if (referer.includes(':6405')) return 'content-forge';
      if (referer.includes(':6400')) return 'frontend';
    }

    return 'external';
  }

  private async logMessage(
    id: string,
    source: string,
    method: string,
    req: Request,
    responseData: unknown,
    durationMs: number,
    status: ProtocolMessage['status'],
  ): Promise<void> {
    const now = new Date().toISOString();
    const sentAt = new Date(Date.now() - durationMs).toISOString();

    // Extract security envelope from request params if present
    const securityEnvelope = this.extractSecurityEnvelope(req);

    // Build the protocol message
    const message: ProtocolMessage = {
      id,
      timestamp: now,
      source,
      target: this.agentId,
      method,
      protocol: await this.getActiveProtocolConfig(),
      request: {
        jsonrpc: '2.0' as const,
        id: `req-${id}`,
        method,
        params: {
          ...(req.body && typeof req.body === 'object' ? req.body : {}),
          ...(req.query && Object.keys(req.query).length > 0 ? { query: req.query } : {}),
          ...(securityEnvelope ? { security: securityEnvelope } : {}),
        },
      },
      response: {
        jsonrpc: '2.0' as const,
        id: `req-${id}`,
        ...(status === 'success'
          ? { result: this.sanitizeResponse(responseData) }
          : { error: { code: -32000, message: String(responseData && typeof responseData === 'object' && 'error' in responseData ? (responseData as Record<string, unknown>).error : 'Unknown error') } }),
      },
      timing: {
        sentAt,
        receivedAt: sentAt,
        completedAt: now,
        durationMs,
      },
      status,
    };

    // Fire-and-forget POST to Protocol API
    this.postToProtocolApi(message).catch((err) => {
      this.logger.warn(`Failed to log message ${id}: ${err.message}`);
    });
  }

  private extractSecurityEnvelope(req: Request): Record<string, unknown> | null {
    // Check for security envelope in headers
    const nonce = req.headers['x-security-nonce'] as string;
    const signature = req.headers['x-security-signature'] as string;
    const senderId = req.headers['x-security-sender-id'] as string;
    const senderPublicKey = req.headers['x-security-public-key'] as string;
    const identityProvider = req.headers['x-security-identity-provider'] as string;

    if (nonce || signature) {
      return {
        nonce: nonce || randomUUID(),
        timestamp: Date.now(),
        senderId: senderId || 'unknown',
        senderPublicKey: senderPublicKey || '',
        signature: signature || '',
        identityProvider: identityProvider || 'local-keys',
      };
    }

    // Check for security in request body params
    if (req.body?.security) {
      return req.body.security;
    }

    return null;
  }

  private sanitizeResponse(data: unknown): Record<string, unknown> {
    if (!data || typeof data !== 'object') {
      return { content: String(data) };
    }
    // Truncate large responses to avoid bloating the store
    const json = JSON.stringify(data);
    if (json.length > 2000) {
      return {
        content: json.slice(0, 2000) + '...(truncated)',
        _truncated: true,
        _originalLength: json.length,
      };
    }
    return data as Record<string, unknown>;
  }

  private async getActiveProtocolConfig(): Promise<ProtocolMessage['protocol']> {
    try {
      const response = await fetch(`${this.protocolApiUrl}/api/protocol/config`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const config = (await response.json()) as Record<string, string>;
        return {
          discovery: config['discovery'] || 'well-known',
          transport: config['transport'] || 'http-rest',
          negotiation: config['negotiation'] || 'capability-card',
          identity: config['identity'] || 'local-keys',
          payment: config['payment'] || 'mock',
          encryption: config['encryption'] || 'none',
          trust: config['trust'] || 'allowlist',
        };
      }
    } catch {
      // Protocol API might not be running yet — use defaults
    }
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

  private async postToProtocolApi(message: ProtocolMessage): Promise<void> {
    const response = await fetch(`${this.protocolApiUrl}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(message),
    });
    if (!response.ok) {
      throw new Error(`Protocol API returned ${response.status}`);
    }
  }
}
