import { Test, TestingModule } from '@nestjs/testing';
import { AgentRunnerRegistryService } from './agent-runner-registry.service';
import { ContextAgentRunnerService } from './context-agent-runner.service';
import { ApiAgentRunnerService } from './api-agent-runner.service';
import { ExternalAgentRunnerService } from './external-agent-runner.service';
import { OrchestratorAgentRunnerService } from './orchestrator-agent-runner.service';
import { RagAgentRunnerService } from './rag-agent-runner.service';
import { MediaAgentRunnerService } from './media-agent-runner.service';
import { LanggraphAgentRunnerService } from './langgraph-agent-runner.service';
import { IAgentRunner } from '../interfaces/agent-runner.interface';
import { TaskResponseDto } from '../dto/task-response.dto';
import { AgentTaskMode } from '../dto/task-request.dto';

// Mock runner for testing
class MockAgentRunner implements IAgentRunner {
  constructor(private readonly name: string) {}

  execute(): Promise<TaskResponseDto> {
    return Promise.resolve(
      TaskResponseDto.success(AgentTaskMode.CONVERSE, {
        content: { message: `Response from ${this.name}` },
        metadata: {},
      }),
    );
  }
}

// The registry auto-registers 7 runners in constructor:
// context, api, external, orchestrator, rag-runner, media, langgraph
const AUTO_REGISTERED_COUNT = 7;
const AUTO_REGISTERED_TYPES = [
  'context',
  'api',
  'external',
  'orchestrator',
  'rag-runner',
  'media',
  'langgraph',
];

describe('AgentRunnerRegistryService', () => {
  let service: AgentRunnerRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentRunnerRegistryService,
        {
          provide: ContextAgentRunnerService,
          useValue: new MockAgentRunner('context'),
        },
        {
          provide: ApiAgentRunnerService,
          useValue: new MockAgentRunner('api'),
        },
        {
          provide: ExternalAgentRunnerService,
          useValue: new MockAgentRunner('external'),
        },
        {
          provide: OrchestratorAgentRunnerService,
          useValue: new MockAgentRunner('orchestrator'),
        },
        {
          provide: RagAgentRunnerService,
          useValue: new MockAgentRunner('rag'),
        },
        {
          provide: MediaAgentRunnerService,
          useValue: new MockAgentRunner('media'),
        },
        {
          provide: LanggraphAgentRunnerService,
          useValue: new MockAgentRunner('langgraph'),
        },
      ],
    }).compile();

    service = module.get<AgentRunnerRegistryService>(
      AgentRunnerRegistryService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerRunner', () => {
    it('should register a runner for a new agent type', () => {
      const mockRunner = new MockAgentRunner('custom');

      service.registerRunner('custom', mockRunner);

      expect(service.hasRunner('custom')).toBe(true);
      expect(service.getRunner('custom')).toBe(mockRunner);
    });

    it('should allow overwriting an existing runner', () => {
      const mockRunner1 = new MockAgentRunner('context-v1');
      const mockRunner2 = new MockAgentRunner('context-v2');

      service.registerRunner('context', mockRunner1);
      service.registerRunner('context', mockRunner2);

      const runner = service.getRunner('context');
      expect(runner).toBe(mockRunner2);
    });

    it('should register multiple runners for different types', () => {
      const custom1Runner = new MockAgentRunner('custom1');
      const custom2Runner = new MockAgentRunner('custom2');
      const custom3Runner = new MockAgentRunner('custom3');

      service.registerRunner('custom1', custom1Runner);
      service.registerRunner('custom2', custom2Runner);
      service.registerRunner('custom3', custom3Runner);

      // 7 auto-registered + 3 custom = 10
      expect(service.getRunnerCount()).toBe(AUTO_REGISTERED_COUNT + 3);
      expect(service.getRunner('custom1')).toBe(custom1Runner);
      expect(service.getRunner('custom2')).toBe(custom2Runner);
      expect(service.getRunner('custom3')).toBe(custom3Runner);
    });
  });

  describe('getRunner', () => {
    it('should return the runner for an auto-registered type', () => {
      const runner = service.getRunner('context');

      expect(runner).toBeDefined();
      expect(runner).not.toBeNull();
    });

    it('should return the runner for a newly registered type', () => {
      const mockRunner = new MockAgentRunner('custom');
      service.registerRunner('custom', mockRunner);

      const runner = service.getRunner('custom');

      expect(runner).toBe(mockRunner);
    });

    it('should return null for an unregistered type', () => {
      const runner = service.getRunner('unknown-type');

      expect(runner).toBeNull();
    });
  });

  describe('hasRunner', () => {
    it('should return true for all auto-registered types', () => {
      for (const type of AUTO_REGISTERED_TYPES) {
        expect(service.hasRunner(type)).toBe(true);
      }
    });

    it('should return false for removed runner types (prediction, risk)', () => {
      // prediction and risk were removed from Forge after specialization
      expect(service.hasRunner('prediction')).toBe(false);
      expect(service.hasRunner('risk')).toBe(false);
    });

    it('should return true for a newly registered type', () => {
      const mockRunner = new MockAgentRunner('custom');
      service.registerRunner('custom', mockRunner);

      expect(service.hasRunner('custom')).toBe(true);
    });

    it('should return false for an unregistered type', () => {
      expect(service.hasRunner('unknown-type')).toBe(false);
    });
  });

  describe('getRegisteredTypes', () => {
    it('should return all auto-registered agent types', () => {
      const types = service.getRegisteredTypes();

      for (const type of AUTO_REGISTERED_TYPES) {
        expect(types).toContain(type);
      }
      expect(types.length).toBe(AUTO_REGISTERED_COUNT);
    });

    it('should not include removed runner types', () => {
      const types = service.getRegisteredTypes();

      // prediction and risk were removed from Forge after specialization
      expect(types).not.toContain('prediction');
      expect(types).not.toContain('risk');
    });

    it('should return additional manually registered types', () => {
      service.registerRunner('custom', new MockAgentRunner('custom'));

      const types = service.getRegisteredTypes();

      for (const type of AUTO_REGISTERED_TYPES) {
        expect(types).toContain(type);
      }
      expect(types).toContain('custom');
      expect(types.length).toBe(AUTO_REGISTERED_COUNT + 1);
    });
  });

  describe('getRunnerCount', () => {
    it(`should return ${AUTO_REGISTERED_COUNT} for auto-registered runners`, () => {
      expect(service.getRunnerCount()).toBe(AUTO_REGISTERED_COUNT);
    });

    it('should return the correct count after adding more runners', () => {
      expect(service.getRunnerCount()).toBe(AUTO_REGISTERED_COUNT);

      service.registerRunner('custom1', new MockAgentRunner('custom1'));
      expect(service.getRunnerCount()).toBe(AUTO_REGISTERED_COUNT + 1);

      service.registerRunner('custom2', new MockAgentRunner('custom2'));
      expect(service.getRunnerCount()).toBe(AUTO_REGISTERED_COUNT + 2);
    });
  });
});
