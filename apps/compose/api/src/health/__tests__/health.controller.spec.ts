import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '../health.controller';
import { DATABASE_SERVICE } from '@/database';

describe('HealthController', () => {
  let controller: HealthController;

  const mockDatabaseService = {
    checkConnection: jest.fn(),
    getConfig: jest.fn(),
    from: jest.fn(),
    rpc: jest.fn(),
    rawQuery: jest.fn(),
    getCheckpointSaver: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DATABASE_SERVICE,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('healthCheck — GET /health', () => {
    it('returns status healthy with timestamp and service name', () => {
      const result = controller.healthCheck();

      expect(result.status).toBe('healthy');
      expect(result.service).toBe('NestJS A2A Agent Framework');
      expect(typeof result.timestamp).toBe('string');
      expect(new Date(result.timestamp).getTime()).not.toBeNaN();
    });
  });

  describe('checkDbConnection — GET /health/db', () => {
    it('returns database connection result on success', async () => {
      const expected = {
        status: 'ok',
        message: 'Database connection successful',
      };
      mockDatabaseService.checkConnection.mockResolvedValueOnce(expected);

      const result = await controller.checkDbConnection();

      expect(result).toEqual(expected);
      expect(mockDatabaseService.checkConnection).toHaveBeenCalledTimes(1);
    });

    it('propagates errors from the database service', async () => {
      mockDatabaseService.checkConnection.mockRejectedValueOnce(
        new Error('Connection refused'),
      );

      await expect(controller.checkDbConnection()).rejects.toThrow(
        'Connection refused',
      );
    });
  });

  describe('checkSupabase — GET /health/supabase', () => {
    it('returns ok status when database connection succeeds', async () => {
      const dbResult = { status: 'ok', message: 'Connected' };
      mockDatabaseService.checkConnection.mockResolvedValueOnce(dbResult);

      const result = await controller.checkSupabase();

      expect(result.status).toBe('ok');
      expect(result.supabase).toEqual(dbResult);
      expect(typeof result.timestamp).toBe('string');
    });

    it('returns error status when database connection throws', async () => {
      mockDatabaseService.checkConnection.mockRejectedValueOnce(
        new Error('Supabase unreachable'),
      );

      const result = await controller.checkSupabase();

      expect(result.status).toBe('error');
      expect(result.supabase).toMatchObject({
        status: 'error',
        message: 'Supabase unreachable',
      });
      expect(typeof result.timestamp).toBe('string');
    });

    it('returns error status with Unknown error for non-Error throws', async () => {
      mockDatabaseService.checkConnection.mockRejectedValueOnce('string error');

      const result = await controller.checkSupabase();

      expect(result.status).toBe('error');
      expect(result.supabase.message).toBe('Unknown error');
    });
  });

  describe('getDbConfig — GET /health/db/config', () => {
    it('returns database config merged with timestamp', () => {
      const dbConfig = {
        provider: 'supabase',
        url: 'http://localhost:8001',
        schemas: ['public'],
        clientsAvailable: { anon: true, service: true },
      };
      mockDatabaseService.getConfig.mockReturnValueOnce(dbConfig);

      const result = controller.getDbConfig();

      expect(result.provider).toBe('supabase');
      expect(result.url).toBe('http://localhost:8001');
      expect(typeof result.timestamp).toBe('string');
      expect(new Date(result.timestamp).getTime()).not.toBeNaN();
      expect(mockDatabaseService.getConfig).toHaveBeenCalledTimes(1);
    });
  });
});
