import { Test, TestingModule } from '@nestjs/testing';
import { A2AReceiverController } from './a2a-receiver.controller';
import { A2AValidatorService } from './a2a-validator.service';
import { A2ARouterService } from './a2a-router.service';
import { SigningService } from '../security/signing.service';
import { RateLimiterService } from '../security/rate-limiter.service';
import { OriginValidatorService } from '../security/origin-validator.service';
import { BridgeDatabaseService } from '../database/bridge-database.service';

const VALID_BODY = {
  jsonrpc: '2.0' as const,
  id: 'req-001',
  method: 'compose.converse',
  params: { userMessage: 'hello' },
};

const SUCCESS_RESPONSE = {
  jsonrpc: '2.0',
  id: 'req-001',
  result: { success: true, payload: { content: 'Hello back' } },
};

// Mock BridgeDatabaseService — message logging must not block tests
const mockDb: Partial<BridgeDatabaseService> = {
  logMessage: jest.fn().mockResolvedValue('mock-message-id'),
  updateMessageStatus: jest.fn().mockResolvedValue(undefined),
};

describe('A2AReceiverController', () => {
  let controller: A2AReceiverController;
  let validator: A2AValidatorService;
  let router: A2ARouterService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [A2AReceiverController],
      providers: [
        A2AValidatorService,
        A2ARouterService,
        SigningService,
        RateLimiterService,
        OriginValidatorService,
        { provide: BridgeDatabaseService, useValue: mockDb },
      ],
    }).compile();

    controller = module.get<A2AReceiverController>(A2AReceiverController);
    validator = module.get<A2AValidatorService>(A2AValidatorService);
    router = module.get<A2ARouterService>(A2ARouterService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('receiveTask()', () => {
    it('should return the router response when validation passes', async () => {
      jest.spyOn(validator, 'validateInboundRequest').mockReturnValue({ valid: true });
      jest.spyOn(router, 'resolveRoute').mockReturnValue({
        product: 'compose',
        baseUrl: 'http://localhost:6300',
        path: '/a2a/tasks',
      });
      jest.spyOn(router, 'forwardRequest').mockResolvedValue(SUCCESS_RESPONSE);

      const response = await controller.receiveTask(
        VALID_BODY,
        'agent-ext',
        'http://ext-agent.io',
        '',
        'localhost:6600',
      );

      expect(response).toEqual(SUCCESS_RESPONSE);
    });

    it('should log the inbound message as pending on receipt', async () => {
      jest.spyOn(validator, 'validateInboundRequest').mockReturnValue({ valid: true });
      jest.spyOn(router, 'resolveRoute').mockReturnValue({
        product: 'compose',
        baseUrl: 'http://localhost:6300',
        path: '/a2a/tasks',
      });
      jest.spyOn(router, 'forwardRequest').mockResolvedValue(SUCCESS_RESPONSE);

      await controller.receiveTask(VALID_BODY, 'agent-ext', 'http://ext-agent.io', '', 'localhost:6600');

      expect(mockDb.logMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: 'inbound',
          status: 'pending',
          method: 'compose.converse',
        }),
      );
    });

    it('should update message status to success on successful forwarding', async () => {
      jest.spyOn(validator, 'validateInboundRequest').mockReturnValue({ valid: true });
      jest.spyOn(router, 'resolveRoute').mockReturnValue({
        product: 'compose',
        baseUrl: 'http://localhost:6300',
        path: '/a2a/tasks',
      });
      jest.spyOn(router, 'forwardRequest').mockResolvedValue(SUCCESS_RESPONSE);

      await controller.receiveTask(VALID_BODY, 'agent-ext', 'http://ext-agent.io', '', 'localhost:6600');

      expect(mockDb.updateMessageStatus).toHaveBeenCalledWith(
        'mock-message-id',
        'success',
        SUCCESS_RESPONSE,
        expect.any(Number),
      );
    });

    it('should return a JSON-RPC error when validation fails', async () => {
      jest.spyOn(validator, 'validateInboundRequest').mockReturnValue({
        valid: false,
        jsonRpcError: { code: -32003, message: 'Origin not trusted: http://unknown.io' },
      });

      const response = (await controller.receiveTask(
        VALID_BODY,
        'agent-ext',
        'http://unknown.io',
        '',
        'localhost:6600',
      )) as { jsonrpc: string; id: unknown; error: { code: number } };

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe('req-001');
      expect(response.error.code).toBe(-32003);
    });

    it('should update message status to rejected when validation fails', async () => {
      jest.spyOn(validator, 'validateInboundRequest').mockReturnValue({
        valid: false,
        jsonRpcError: { code: -32003, message: 'Origin not trusted' },
      });

      await controller.receiveTask(VALID_BODY, 'agent-ext', 'http://unknown.io', '', 'localhost:6600');

      expect(mockDb.updateMessageStatus).toHaveBeenCalledWith(
        'mock-message-id',
        'rejected',
        expect.objectContaining({ error: expect.objectContaining({ code: -32003 }) }),
        expect.any(Number),
      );
    });

    it('should return a -32700 error when X-Security-Envelope is malformed JSON', async () => {
      const response = (await controller.receiveTask(
        VALID_BODY,
        'agent-ext',
        'http://any.io',
        '{bad json',
        'localhost:6600',
      )) as { jsonrpc: string; id: unknown; error: { code: number; message: string } };

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe('req-001');
      expect(response.error.code).toBe(-32700);
      expect(response.error.message).toContain('Failed to parse X-Security-Envelope header');
    });

    it('should return a -32000 routing error when forwardRequest throws', async () => {
      jest.spyOn(validator, 'validateInboundRequest').mockReturnValue({ valid: true });
      jest.spyOn(router, 'resolveRoute').mockReturnValue({
        product: 'compose',
        baseUrl: 'http://localhost:6300',
        path: '/a2a/tasks',
      });
      jest.spyOn(router, 'forwardRequest').mockRejectedValue(
        new Error('compose returned HTTP 503'),
      );

      const response = (await controller.receiveTask(
        VALID_BODY,
        'agent-ext',
        'http://ext-agent.io',
        '',
        'localhost:6600',
      )) as { jsonrpc: string; id: unknown; error: { code: number; message: string } };

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe('req-001');
      expect(response.error.code).toBe(-32000);
      expect(response.error.message).toContain('Bridge routing error');
    });

    it('should update message status to error when forwardRequest throws', async () => {
      jest.spyOn(validator, 'validateInboundRequest').mockReturnValue({ valid: true });
      jest.spyOn(router, 'resolveRoute').mockReturnValue({
        product: 'compose',
        baseUrl: 'http://localhost:6300',
        path: '/a2a/tasks',
      });
      jest.spyOn(router, 'forwardRequest').mockRejectedValue(new Error('503'));

      await controller.receiveTask(VALID_BODY, 'agent-ext', 'http://ext-agent.io', '', 'localhost:6600');

      expect(mockDb.updateMessageStatus).toHaveBeenCalledWith(
        'mock-message-id',
        'error',
        expect.objectContaining({ error: expect.objectContaining({ code: -32000 }) }),
        expect.any(Number),
      );
    });

    it('should use host header as origin fallback when origin header is absent', async () => {
      const validateSpy = jest
        .spyOn(validator, 'validateInboundRequest')
        .mockReturnValue({ valid: true });
      jest.spyOn(router, 'resolveRoute').mockReturnValue({
        product: 'compose',
        baseUrl: 'http://localhost:6300',
        path: '/a2a/tasks',
      });
      jest.spyOn(router, 'forwardRequest').mockResolvedValue(SUCCESS_RESPONSE);

      await controller.receiveTask(
        VALID_BODY,
        'agent-ext',
        undefined as unknown as string, // no origin header
        '',
        'myhost:6600',
      );

      // Should fall back to http://myhost:6600
      expect(validateSpy).toHaveBeenCalledWith(
        VALID_BODY,
        'agent-ext',
        'http://myhost:6600',
        undefined,
      );
    });

    it('should use "unknown" as the request id when body has no id', async () => {
      const bodyWithoutId = { jsonrpc: '2.0', method: 'test' };

      jest.spyOn(validator, 'validateInboundRequest').mockReturnValue({
        valid: false,
        jsonRpcError: { code: -32600, message: 'Invalid' },
      });

      const response = (await controller.receiveTask(
        bodyWithoutId,
        'agent',
        'http://any.io',
        '',
        'localhost',
      )) as { id: unknown };

      expect(response.id).toBe('unknown');
    });
  });
});
