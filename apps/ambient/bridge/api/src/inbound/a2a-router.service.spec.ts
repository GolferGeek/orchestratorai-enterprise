import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { A2ARouterService } from './a2a-router.service';

// ---------------------------------------------------------------------------
// Mock ConfigService factory — returns defaults matching the old process.env
// defaults so all existing assertions continue to pass unchanged.
// ---------------------------------------------------------------------------

function makeConfigService(overrides: Record<string, string> = {}): Partial<ConfigService> {
  const defaults: Record<string, string> = {
    FORGE_API_URL: 'http://localhost:5200',
    COMPOSE_API_URL: 'http://localhost:5300',
    PULSE_API_URL: 'http://localhost:5500',
    DEFAULT_ORG_SLUG: 'default',
    ...overrides,
  };

  return {
    get: jest.fn(<T>(key: string, defaultValue?: T): T => {
      return (key in defaults ? defaults[key] : defaultValue) as T;
    }),
  };
}

describe('A2ARouterService', () => {
  let service: A2ARouterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        A2ARouterService,
        { provide: ConfigService, useValue: makeConfigService() },
      ],
    }).compile();

    service = module.get<A2ARouterService>(A2ARouterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // resolveRoute()
  // ---------------------------------------------------------------------------

  describe('resolveRoute()', () => {
    describe('explicit product prefix routing', () => {
      it('should route forge.* methods to the Forge API', () => {
        const target = service.resolveRoute('forge.run-workflow');
        expect(target.product).toBe('forge');
        expect(target.baseUrl).toBe('http://localhost:5200');
        expect(target.path).toBe('/a2a/tasks');
      });

      it('should route compose.* methods to the Compose API', () => {
        const target = service.resolveRoute('compose.converse');
        expect(target.product).toBe('compose');
        expect(target.baseUrl).toBe('http://localhost:5300');
        expect(target.path).toBe('/a2a/tasks');
      });

      it('should route pulse.* methods to the Pulse API', () => {
        const target = service.resolveRoute('pulse.trigger');
        expect(target.product).toBe('pulse');
        expect(target.baseUrl).toBe('http://localhost:5500');
        expect(target.path).toBe('/internal/event');
      });

      it('should route ambient.* methods to the Pulse API', () => {
        const target = service.resolveRoute('ambient.watch');
        expect(target.product).toBe('pulse');
        expect(target.baseUrl).toBe('http://localhost:5500');
        expect(target.path).toBe('/internal/event');
      });
    });

    describe('skill-based routing', () => {
      it('should route to Forge when params.skill includes "langgraph"', () => {
        const target = service.resolveRoute('agent.run', { skill: 'langgraph' });
        expect(target.product).toBe('forge');
      });

      it('should route to Forge when params.skill includes "workflow"', () => {
        const target = service.resolveRoute('agent.run', { skill: 'workflow' });
        expect(target.product).toBe('forge');
      });

      it('should route to Forge when params.skill includes "orchestration"', () => {
        const target = service.resolveRoute('agent.run', { skill: 'orchestration' });
        expect(target.product).toBe('forge');
      });

      it('should route to Forge when params.skill includes "multi-agent"', () => {
        const target = service.resolveRoute('agent.run', { skill: 'multi-agent' });
        expect(target.product).toBe('forge');
      });

      it('should route to Forge when params.skill is "plan.create"', () => {
        const target = service.resolveRoute('agent.run', { skill: 'plan.create' });
        expect(target.product).toBe('forge');
      });

      it('should route to Forge when params.skill is "plan.execute"', () => {
        const target = service.resolveRoute('agent.run', { skill: 'plan.execute' });
        expect(target.product).toBe('forge');
      });

      it('should route to Forge when the method itself contains a forge skill name', () => {
        const target = service.resolveRoute('plan.create');
        expect(target.product).toBe('forge');
      });
    });

    describe('default routing', () => {
      it('should default to Compose for unknown methods', () => {
        const target = service.resolveRoute('unknown.method');
        expect(target.product).toBe('compose');
      });

      it('should default to Compose when no skill matches', () => {
        const target = service.resolveRoute('agent.chat', { skill: 'rag' });
        expect(target.product).toBe('compose');
      });
    });

    describe('custom config URLs', () => {
      it('should use FORGE_API_URL from ConfigService when set', async () => {
        const module = await Test.createTestingModule({
          providers: [
            A2ARouterService,
            { provide: ConfigService, useValue: makeConfigService({ FORGE_API_URL: 'http://forge-staging:6200' }) },
          ],
        }).compile();
        const customService = module.get<A2ARouterService>(A2ARouterService);

        const target = customService.resolveRoute('forge.something');
        expect(target.baseUrl).toBe('http://forge-staging:6200');
      });

      it('should use COMPOSE_API_URL from ConfigService when set', async () => {
        const module = await Test.createTestingModule({
          providers: [
            A2ARouterService,
            { provide: ConfigService, useValue: makeConfigService({ COMPOSE_API_URL: 'http://compose-staging:6300' }) },
          ],
        }).compile();
        const customService = module.get<A2ARouterService>(A2ARouterService);

        const target = customService.resolveRoute('compose.something');
        expect(target.baseUrl).toBe('http://compose-staging:6300');
      });

      it('should use PULSE_API_URL from ConfigService when set', async () => {
        const module = await Test.createTestingModule({
          providers: [
            A2ARouterService,
            { provide: ConfigService, useValue: makeConfigService({ PULSE_API_URL: 'http://pulse-staging:6500' }) },
          ],
        }).compile();
        const customService = module.get<A2ARouterService>(A2ARouterService);

        const target = customService.resolveRoute('pulse.something');
        expect(target.baseUrl).toBe('http://pulse-staging:6500');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // forwardRequest()
  // ---------------------------------------------------------------------------

  describe('forwardRequest()', () => {
    it('should POST to the target URL with correct Bridge headers', async () => {
      const jsonRpcRequest = {
        jsonrpc: '2.0',
        id: 'fwd-1',
        method: 'compose.converse',
        params: {},
      };
      const mockResponse = { jsonrpc: '2.0', id: 'fwd-1', result: { success: true } };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      }) as jest.Mock;

      const target = service.resolveRoute('compose.converse');
      const response = await service.forwardRequest(target, jsonRpcRequest);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const url = fetchCall[0] as string;
      const options = fetchCall[1] as RequestInit;
      const headers = options.headers as Record<string, string>;

      expect(url).toBe('http://localhost:5300/a2a/tasks');
      expect(options.method).toBe('POST');
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-Bridge-Forwarded']).toBe('true');
      expect(response).toEqual(mockResponse);
    });

    it('should inject an ExecutionContext into params when none is present', async () => {
      const jsonRpcRequest = {
        jsonrpc: '2.0',
        id: 'fwd-2',
        method: 'compose.converse',
        params: { userMessage: 'hello' },
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 'fwd-2', result: {} }),
      }) as jest.Mock;

      const target = service.resolveRoute('compose.converse');
      await service.forwardRequest(target, jsonRpcRequest, 'agent-ext-1');

      const sentBody = JSON.parse(
        ((global.fetch as jest.Mock).mock.calls[0][1] as RequestInit).body as string,
      );

      expect(sentBody.params.context).toBeDefined();
      expect(sentBody.params.context.agentSlug).toBe('bridge-inbound');
      expect(sentBody.params.context.userId).toBe('external:agent-ext-1');
      expect(sentBody.params.context.agentType).toBe('external');
      // Original params must be preserved
      expect(sentBody.params.userMessage).toBe('hello');
    });

    it('should pass through an existing ExecutionContext unchanged', async () => {
      const existingContext = {
        orgSlug: 'my-org',
        userId: 'user-xyz',
        conversationId: 'conv-1',
        agentSlug: 'my-agent',
        agentType: 'context',
        provider: 'openai',
        model: 'gpt-4o',
      };

      const jsonRpcRequest = {
        jsonrpc: '2.0',
        id: 'fwd-3',
        method: 'compose.converse',
        params: { userMessage: 'hello', context: existingContext },
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 'fwd-3', result: {} }),
      }) as jest.Mock;

      const target = service.resolveRoute('compose.converse');
      await service.forwardRequest(target, jsonRpcRequest);

      const sentBody = JSON.parse(
        ((global.fetch as jest.Mock).mock.calls[0][1] as RequestInit).body as string,
      );

      expect(sentBody.params.context).toEqual(existingContext);
    });

    it('should throw when the internal agent returns a non-OK HTTP status', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
      }) as jest.Mock;

      const target = service.resolveRoute('forge.workflow');

      await expect(service.forwardRequest(target, {})).rejects.toThrow(
        'Internal agent forge returned HTTP 503',
      );
    });
  });
});
