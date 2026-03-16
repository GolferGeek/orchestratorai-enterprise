import { HttpException, Injectable } from '@nestjs/common';
import { A2ATaskErrorResponse } from '@orchestrator-ai/transport-types';

type JsonRpcErrorEnvelope = A2ATaskErrorResponse;

@Injectable()
export class JsonRpcResponseService {
  buildJsonRpcError(
    id: string | number | null,
    error: unknown,
  ): JsonRpcErrorEnvelope {
    const { code, message, data } = this.mapExceptionToError(error);

    // Return JSON-RPC 2.0 error response
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        data,
      },
    } as A2ATaskErrorResponse;
  }

  mapExceptionToError(error: unknown): {
    code: number;
    message: string;
    data?: unknown;
  } {
    if (error instanceof HttpException) {
      const status = error.getStatus();
      const response = error.getResponse();
      const payload =
        typeof response === 'string'
          ? { message: response, statusCode: status }
          : response;

      return {
        code: this.statusToJsonRpcCode(status),
        message: this.extractMessage(payload) ?? error.message,
        data: payload,
      };
    }

    const fallbackMessage =
      error instanceof Error ? error.message : 'Internal server error';

    return {
      code: -32603,
      message: fallbackMessage || 'Internal server error',
    };
  }

  statusToJsonRpcCode(status: number): number {
    switch (status) {
      case 400:
      case 422:
        return -32602; // Invalid params
      case 401:
        return -32001; // Unauthorized
      case 403:
        return -32003; // Forbidden
      case 404:
        return -32004; // Not found
      case 409:
        return -32009; // Conflict
      case 429:
        return -32042; // Rate limited
      case 500:
        return -32603; // Internal error
      default:
        if (status >= 500) {
          return -32603;
        }
        return -32000; // Server error (generic)
    }
  }

  private extractMessage(payload: unknown): string | null {
    if (!payload) {
      return null;
    }
    if (typeof payload === 'string') {
      return payload;
    }
    const typedPayload = payload as {
      message?: unknown;
    };
    if (typeof typedPayload.message === 'string') {
      return typedPayload.message;
    }
    if (Array.isArray(typedPayload.message) && typedPayload.message.length) {
      return typedPayload.message.join(', ');
    }
    return null;
  }
}
