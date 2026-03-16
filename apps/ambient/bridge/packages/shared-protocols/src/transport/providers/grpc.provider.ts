import * as crypto from 'crypto';
import { ITransportProvider, TransportMessage, TransportResponse } from '../transport.interface';

/**
 * gRPC transport provider.
 *
 * Simulates protobuf serialization and gRPC call semantics (unary, server-streaming,
 * and health checks) over HTTP/2-style POST requests with binary content type.
 * Real gRPC would use @grpc/grpc-js — this provider gives playground users the ability
 * to explore gRPC-style agent communication without a full protobuf toolchain.
 */
export class GrpcTransportProvider implements ITransportProvider {
  readonly providerId = 'grpc';

  private handler?: (message: TransportMessage) => Promise<TransportResponse>;

  /**
   * Simulates protobuf serialization by converting the message to a JSON buffer
   * representation. In production, this would use compiled .proto definitions.
   */
  private serializeToProtobuf(message: TransportMessage): Buffer {
    return Buffer.from(JSON.stringify(message), 'utf-8');
  }

  /**
   * Simulates protobuf deserialization.
   */
  private deserializeFromProtobuf(buffer: Buffer): TransportResponse {
    return JSON.parse(buffer.toString('utf-8')) as TransportResponse;
  }

  /**
   * Converts a JSON-RPC method name to a gRPC service/method path.
   * Example: "agent.chat" -> "/agent.AgentService/Chat"
   */
  private toGrpcPath(method: string): string {
    const parts = method.split('.');
    const servicePart = parts.length > 1 ? parts[0] : 'default';
    const methodPart = parts.length > 1 ? parts[parts.length - 1] : method;
    const capitalizedMethod = methodPart.charAt(0).toUpperCase() + methodPart.slice(1);
    const capitalizedService = servicePart.charAt(0).toUpperCase() + servicePart.slice(1);
    return `/${servicePart}.${capitalizedService}Service/${capitalizedMethod}`;
  }

  async send(targetUrl: string, message: TransportMessage): Promise<TransportResponse> {
    const id = message.id || crypto.randomUUID();
    const grpcPath = this.toGrpcPath(message.method);
    const serialized = this.serializeToProtobuf({
      jsonrpc: '2.0',
      id,
      method: message.method,
      params: message.params,
    });

    const start = Date.now();
    const url = `${targetUrl.replace(/\/$/, '')}${grpcPath}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/grpc+json',
        'TE': 'trailers',
        'Grpc-Timeout': '30S',
        'X-Request-Id': id,
      },
      body: serialized,
    });

    const latencyMs = Date.now() - start;
    const grpcStatus = response.headers.get('grpc-status');

    if (!response.ok || (grpcStatus !== null && grpcStatus !== '0')) {
      const grpcMessage = response.headers.get('grpc-message') || response.statusText;
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: grpcStatus ? parseInt(grpcStatus, 10) : response.status,
          message: `gRPC error: ${grpcMessage}`,
          data: { grpcPath, latencyMs },
        },
      };
    }

    const responseBuffer = Buffer.from(await response.arrayBuffer());
    return this.deserializeFromProtobuf(responseBuffer);
  }

  receive(handler: (message: TransportMessage) => Promise<TransportResponse>): void {
    this.handler = handler;
  }

  getHandler(): ((message: TransportMessage) => Promise<TransportResponse>) | undefined {
    return this.handler;
  }

  async *stream(targetUrl: string, message: TransportMessage): AsyncIterable<TransportResponse> {
    const id = message.id || crypto.randomUUID();
    const grpcPath = this.toGrpcPath(message.method);
    const serialized = this.serializeToProtobuf({
      jsonrpc: '2.0',
      id,
      method: message.method,
      params: { ...message.params, _serverStream: true },
    });

    const url = `${targetUrl.replace(/\/$/, '')}${grpcPath}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/grpc+json',
        'TE': 'trailers',
        'X-Request-Id': id,
      },
      body: serialized,
    });

    if (!response.ok || !response.body) {
      const grpcStatus = response.headers.get('grpc-status');
      yield {
        jsonrpc: '2.0',
        id,
        error: {
          code: grpcStatus ? parseInt(grpcStatus, 10) : response.status,
          message: `gRPC stream error: ${response.statusText}`,
        },
      };
      return;
    }

    const reader = response.body.getReader();
    let buffer = Buffer.alloc(0);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer = Buffer.concat([buffer, Buffer.from(value)]);

      // gRPC length-prefixed framing: 1 byte compressed flag + 4 bytes length + message
      while (buffer.length >= 5) {
        const messageLength = buffer.readUInt32BE(1);
        const totalFrameLength = 5 + messageLength;

        if (buffer.length < totalFrameLength) break;

        const frameData = buffer.subarray(5, totalFrameLength);
        buffer = buffer.subarray(totalFrameLength);

        yield this.deserializeFromProtobuf(frameData);
      }
    }
  }

  async ping(targetUrl: string): Promise<{ alive: boolean; latencyMs: number }> {
    const start = Date.now();
    const healthCheckMessage: TransportMessage = {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'grpc.health.v1.Health.Check',
    };

    try {
      const url = `${targetUrl.replace(/\/$/, '')}/grpc.health.v1.Health/Check`;
      const serialized = this.serializeToProtobuf(healthCheckMessage);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/grpc+json',
          'TE': 'trailers',
          'Grpc-Timeout': '5S',
        },
        body: serialized,
        signal: AbortSignal.timeout(5000),
      });

      const latencyMs = Date.now() - start;
      const grpcStatus = response.headers.get('grpc-status');

      return {
        alive: response.ok && (grpcStatus === null || grpcStatus === '0'),
        latencyMs,
      };
    } catch {
      return { alive: false, latencyMs: Date.now() - start };
    }
  }
}
