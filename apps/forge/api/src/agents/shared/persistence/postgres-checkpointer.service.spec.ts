import { Test, TestingModule } from '@nestjs/testing';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { PostgresCheckpointerService } from './postgres-checkpointer.service';
import {
  DATABASE_SERVICE,
  DatabaseService,
} from '../../../planes/database/database.interface';

/**
 * Unit tests for PostgresCheckpointerService
 *
 * The service is now a thin wrapper around DATABASE_SERVICE.getCheckpointSaver().
 */
describe('PostgresCheckpointerService', () => {
  let service: PostgresCheckpointerService;
  let mockDb: jest.Mocked<Pick<DatabaseService, 'getCheckpointSaver'>>;
  let mockSaver: jest.Mocked<BaseCheckpointSaver>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockSaver = {
      getTuple: jest.fn(),
      list: jest.fn(),
      put: jest.fn(),
      putWrites: jest.fn(),
    } as unknown as jest.Mocked<BaseCheckpointSaver>;

    mockDb = {
      getCheckpointSaver: jest.fn().mockResolvedValue(mockSaver),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostgresCheckpointerService,
        {
          provide: DATABASE_SERVICE,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<PostgresCheckpointerService>(
      PostgresCheckpointerService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSaver', () => {
    it('should delegate to DATABASE_SERVICE.getCheckpointSaver()', async () => {
      const saver = await service.getSaver();

      expect(saver).toBe(mockSaver);
      expect(mockDb.getCheckpointSaver).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors from DATABASE_SERVICE', async () => {
      mockDb.getCheckpointSaver.mockRejectedValue(
        new Error('Database connection failed'),
      );

      await expect(service.getSaver()).rejects.toThrow(
        'Database connection failed',
      );
    });
  });
});
