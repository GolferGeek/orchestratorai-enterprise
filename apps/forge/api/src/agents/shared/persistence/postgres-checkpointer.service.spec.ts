import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { PostgresCheckpointerService } from './postgres-checkpointer.service';

// Mock the PostgresSaver before any imports
jest.mock('@langchain/langgraph-checkpoint-postgres', () => ({
  PostgresSaver: {
    fromConnString: jest.fn(),
  },
}));

import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

/**
 * Unit tests for PostgresCheckpointerService
 *
 * The service creates a LangGraph PostgresSaver from DATABASE_URL config.
 */
describe('PostgresCheckpointerService', () => {
  let service: PostgresCheckpointerService;
  let mockConfigService: jest.Mocked<Pick<ConfigService, 'getOrThrow'>>;
  let mockSaver: jest.Mocked<BaseCheckpointSaver>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockSaver = {
      getTuple: jest.fn(),
      list: jest.fn(),
      put: jest.fn(),
      putWrites: jest.fn(),
      setup: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<BaseCheckpointSaver>;

    (PostgresSaver.fromConnString as jest.Mock).mockReturnValue(mockSaver);

    mockConfigService = {
      getOrThrow: jest.fn().mockReturnValue('postgresql://postgres:postgres@localhost:5432/postgres'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostgresCheckpointerService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<PostgresCheckpointerService>(PostgresCheckpointerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSaver', () => {
    it('should create a PostgresSaver from DATABASE_URL', async () => {
      const saver = await service.getSaver();

      expect(mockConfigService.getOrThrow).toHaveBeenCalledWith('DATABASE_URL');
      expect(PostgresSaver.fromConnString).toHaveBeenCalledWith(
        'postgresql://postgres:postgres@localhost:5432/postgres',
      );
      expect(saver).toBe(mockSaver);
    });

    it('should call setup() on the PostgresSaver', async () => {
      await service.getSaver();

      expect((mockSaver as unknown as { setup: jest.Mock }).setup).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors from ConfigService', async () => {
      mockConfigService.getOrThrow.mockImplementation(() => {
        throw new Error('DATABASE_URL not configured');
      });

      await expect(service.getSaver()).rejects.toThrow('DATABASE_URL not configured');
    });
  });
});
