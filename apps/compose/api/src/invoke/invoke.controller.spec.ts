/**
 * InvokeController unit tests
 *
 * Tests POST /invoke JSON-RPC 2.0 response shape, missing params guard,
 * error propagation from the dispatch service, POST /invoke/stream SSE
 * setup and error path, GET /invoke/conversations/:id/messages field
 * mapping and JSON parsing, and DELETE /invoke/conversations/:id.
 */

import { InvokeController } from './invoke.controller';
import { InvokeDispatchService } from './invoke-dispatch.service';
import { ProvidersModelsService } from './providers-models.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { JsonRpcErrorCode } from '@orchestrator-ai/transport-types';
import type {
  A2AInvokeRequest,
  InvokeOutput,
} from '@orchestrator-ai/transport-types';
import type { Response } from 'express';

function buildRequest(overrides?: Partial<A2AInvokeRequest>): A2AInvokeRequest {
  return {
    jsonrpc: '2.0',
    id: 'req-1',
    method: 'invoke',
    params: {
      context: createMockExecutionContext(),
      data: { content: 'hello' },
    },
    ...overrides,
  };
}

const mockOutput: InvokeOutput = {
  content: 'response text',
  outputType: 'text',
  metadata: { agentSlug: 'test-agent' },
};

/** Build a minimal express Response mock for SSE tests. */
function buildMockRes(): jest.Mocked<
  Pick<Response, 'write' | 'end' | 'status' | 'json' | 'setHeader' | 'flushHeaders' | 'writableEnded'>
> {
  const res = {
    write: jest.fn(),
    end: jest.fn(),
    status: jest.fn(),
    json: jest.fn(),
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    writableEnded: false,
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as never;
}

const baseMessageRow: Record<string, unknown> = {
  id: 'msg-1',
  role: 'user',
  content: 'What is AI?',
  output_type: 'text',
  metadata: null,
  attachments: null,
  created_at: '2026-04-18T10:00:00.000Z',
};

describe('InvokeController', () => {
  let controller: InvokeController;
  let dispatch: jest.Mocked<
    Pick<InvokeDispatchService, 'invoke' | 'invokeStream'>
  >;
  let providersModels: jest.Mocked<
    Pick<ProvidersModelsService, 'fetchProvidersAndModels'>
  >;
  let mockDb: { from: jest.Mock; select: jest.Mock; eq: jest.Mock; order: jest.Mock; delete: jest.Mock };

  beforeEach(() => {
    dispatch = {
      invoke: jest.fn().mockResolvedValue(mockOutput),
      invokeStream: jest.fn().mockResolvedValue(undefined),
    };

    providersModels = {
      fetchProvidersAndModels: jest
        .fn()
        .mockResolvedValue({ providers: [], models: [] }),
    };

    mockDb = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [baseMessageRow], error: null }),
      delete: jest.fn().mockReturnThis(),
    };

    controller = new InvokeController(
      dispatch as unknown as InvokeDispatchService,
      {} as never, // AgentDefinitionService (not tested here)
      providersModels as unknown as ProvidersModelsService,
      { fetchForUser: jest.fn().mockResolvedValue([]) } as never, // ConversationsService
      mockDb as never,
    );
  });

  describe('invoke — happy path', () => {
    it('returns JSON-RPC 2.0 success response with output', async () => {
      const request = buildRequest();
      const response = await controller.invoke(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe('req-1');
      expect('result' in response).toBe(true);

      if ('result' in response) {
        expect(response.result.success).toBe(true);
        expect(response.result.output).toEqual(mockOutput);
        expect(response.result.context).toEqual(request.params.context);
      }
    });

    it('passes context, data, and metadata to dispatch service', async () => {
      const context = createMockExecutionContext({ agentSlug: 'my-agent' });
      const data = { content: 'query text' };
      const metadata = { hint: 'streaming' };
      const request: A2AInvokeRequest = {
        jsonrpc: '2.0',
        id: 42,
        method: 'invoke',
        params: { context, data, metadata },
      };

      await controller.invoke(request);

      expect(dispatch.invoke).toHaveBeenCalledWith(context, data, metadata);
    });
  });

  describe('invoke — missing params', () => {
    it('returns INVALID_PARAMS error when context is missing', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 'req-2',
        method: 'invoke' as const,
        params: { data: { content: 'test' } } as never,
      };

      const response = await controller.invoke(request);

      expect('error' in response).toBe(true);
      if ('error' in response) {
        expect(response.error.code).toBe(JsonRpcErrorCode.INVALID_PARAMS);
      }
      expect(dispatch.invoke).not.toHaveBeenCalled();
    });
  });

  describe('invoke — dispatch error', () => {
    it('returns INTERNAL_ERROR response when dispatch throws', async () => {
      dispatch.invoke.mockRejectedValueOnce(
        new Error('Agent not found: unknown-agent'),
      );
      const request = buildRequest();

      const response = await controller.invoke(request);

      expect('error' in response).toBe(true);
      if ('error' in response) {
        expect(response.error.code).toBe(JsonRpcErrorCode.INTERNAL_ERROR);
        expect(response.error.message).toContain('Agent not found');
      }
    });
  });

  describe('invokeStream — happy path', () => {
    it('sets SSE headers and delegates to dispatch.invokeStream', async () => {
      const request = buildRequest();
      const res = buildMockRes();

      await controller.invokeStream(request, res as never);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(res.flushHeaders).toHaveBeenCalled();
      expect(dispatch.invokeStream).toHaveBeenCalledWith(
        request.params!.context,
        request.params!.data,
        request.params!.metadata,
        request.id,
        res,
      );
    });
  });

  describe('invokeStream — missing params', () => {
    it('returns 400 JSON error when context is missing', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 'req-s',
        method: 'invoke' as const,
        params: { data: { content: 'test' } } as never,
      };
      const res = buildMockRes();

      await controller.invokeStream(request, res as never);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonrpc: '2.0',
          error: expect.objectContaining({ code: JsonRpcErrorCode.INVALID_PARAMS }),
        }),
      );
      expect(dispatch.invokeStream).not.toHaveBeenCalled();
    });
  });

  describe('invokeStream — dispatch error', () => {
    it('writes SSE error event and ends response when dispatch throws', async () => {
      dispatch.invokeStream.mockRejectedValueOnce(new Error('runner exploded'));
      const request = buildRequest();
      const res = buildMockRes();

      await controller.invokeStream(request, res as never);

      const writes = res.write.mock.calls.map((c) => c[0] as string);
      const errorWrite = writes.find((w) => w.includes('"event":"error"'));
      expect(errorWrite).toBeDefined();
      expect(errorWrite).toContain('runner exploded');
      expect(res.end).toHaveBeenCalled();
    });
  });

  describe('getConversationMessages — happy path', () => {
    it('returns messages with mapped fields', async () => {
      const result = await controller.getConversationMessages('conv-1');

      expect(result.messages).toHaveLength(1);
      const msg = result.messages[0]!;
      expect(msg.id).toBe('msg-1');
      expect(msg.role).toBe('user');
      expect(msg.content).toBe('What is AI?');
      expect(msg.outputType).toBe('text');
      expect(msg.createdAt).toBe('2026-04-18T10:00:00.000Z');
    });

    it('queries conversation_messages filtered by conversation_id ordered by created_at ASC', async () => {
      await controller.getConversationMessages('conv-abc');

      expect(mockDb.from).toHaveBeenCalledWith(null, 'conversation_messages');
      expect(mockDb.eq).toHaveBeenCalledWith('conversation_id', 'conv-abc');
      expect(mockDb.order).toHaveBeenCalledWith('created_at', { ascending: true });
    });

    it('parses metadata from JSON string to object', async () => {
      const rowWithMeta = { ...baseMessageRow, metadata: '{"tokensUsed":120}' };
      mockDb.order.mockResolvedValueOnce({ data: [rowWithMeta], error: null });

      const result = await controller.getConversationMessages('conv-1');

      expect(result.messages[0]?.metadata).toEqual({ tokensUsed: 120 });
    });

    it('passes through metadata that is already an object', async () => {
      const rowWithMeta = { ...baseMessageRow, metadata: { key: 'value' } };
      mockDb.order.mockResolvedValueOnce({ data: [rowWithMeta], error: null });

      const result = await controller.getConversationMessages('conv-1');

      expect(result.messages[0]?.metadata).toEqual({ key: 'value' });
    });

    it('parses attachments from JSON string to array', async () => {
      const rowWithAtt = {
        ...baseMessageRow,
        attachments: '[{"filename":"doc.pdf","mimeType":"application/pdf"}]',
      };
      mockDb.order.mockResolvedValueOnce({ data: [rowWithAtt], error: null });

      const result = await controller.getConversationMessages('conv-1');

      expect(result.messages[0]?.attachments).toEqual([
        { filename: 'doc.pdf', mimeType: 'application/pdf' },
      ]);
    });

    it('passes through attachments that are already an array', async () => {
      const rowWithAtt = {
        ...baseMessageRow,
        attachments: [{ filename: 'img.png', mimeType: 'image/png' }],
      };
      mockDb.order.mockResolvedValueOnce({ data: [rowWithAtt], error: null });

      const result = await controller.getConversationMessages('conv-1');

      expect(result.messages[0]?.attachments).toEqual([
        { filename: 'img.png', mimeType: 'image/png' },
      ]);
    });

    it('returns empty messages array when DB returns no rows', async () => {
      mockDb.order.mockResolvedValueOnce({ data: [], error: null });

      const result = await controller.getConversationMessages('conv-1');

      expect(result.messages).toEqual([]);
    });
  });

  describe('getConversationMessages — error propagation', () => {
    it('throws when DB returns an error', async () => {
      mockDb.order.mockResolvedValueOnce({
        data: null,
        error: { message: 'relation does not exist' },
      });

      await expect(controller.getConversationMessages('conv-1')).rejects.toThrow(
        'Failed to load messages',
      );
    });
  });

  describe('deleteConversation — happy path', () => {
    it('returns { deleted: true } on success', async () => {
      mockDb.eq.mockResolvedValueOnce({ error: null });

      const result = await controller.deleteConversation('conv-1');

      expect(result).toEqual({ deleted: true });
    });

    it('queries conversations table with matching conversation id', async () => {
      mockDb.eq.mockResolvedValueOnce({ error: null });

      await controller.deleteConversation('conv-xyz');

      expect(mockDb.from).toHaveBeenCalledWith(null, 'conversations');
      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockDb.eq).toHaveBeenCalledWith('id', 'conv-xyz');
    });
  });

  describe('deleteConversation — error propagation', () => {
    it('throws when DB returns an error', async () => {
      mockDb.eq.mockResolvedValueOnce({ error: { message: 'not found' } });

      await expect(controller.deleteConversation('conv-1')).rejects.toThrow(
        'Failed to delete conversation',
      );
    });
  });
});
