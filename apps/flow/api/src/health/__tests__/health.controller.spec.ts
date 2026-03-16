import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '../health.controller';
import { DATABASE_SERVICE } from '@/database';

describe('HealthController', () => {
  let controller: HealthController;
  let mockDb: {
    checkConnection: jest.Mock;
    getConfig: jest.Mock;
  };

  beforeEach(async () => {
    mockDb = {
      checkConnection: jest.fn(),
      getConfig: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DATABASE_SERVICE,
          useValue: mockDb,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('healthCheck GET /', () => {
    it('should return healthy status with timestamp and service name', () => {
      const before = new Date().toISOString();
      const result = controller.healthCheck();
      const after = new Date().toISOString();

      expect(result.status).toBe('healthy');
      expect(result.service).toBe('NestJS A2A Agent Framework');
      expect(result.timestamp).toBeDefined();
      expect(result.timestamp >= before).toBe(true);
      expect(result.timestamp <= after).toBe(true);
    });
  });

  describe('checkDbConnection GET /health/db', () => {
    it('should return db connection result when connection succeeds', async () => {
      const mockResult = { status: 'ok', message: 'Database connection successful' };
      mockDb.checkConnection.mockResolvedValue(mockResult);

      const result = await controller.checkDbConnection();

      expect(result).toEqual(mockResult);
      expect(mockDb.checkConnection).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors from db.checkConnection', async () => {
      mockDb.checkConnection.mockRejectedValue(new Error('Connection refused'));

      await expect(controller.checkDbConnection()).rejects.toThrow('Connection refused');
    });
  });

  describe('checkSupabase GET /health/supabase', () => {
    it('should return ok status when db connection succeeds', async () => {
      const mockConnectionResult = { status: 'ok', message: 'Connected' };
      mockDb.checkConnection.mockResolvedValue(mockConnectionResult);

      const before = new Date().toISOString();
      const result = await controller.checkSupabase();
      const after = new Date().toISOString();

      expect(result.status).toBe('ok');
      expect(result.supabase).toEqual(mockConnectionResult);
      expect(result.timestamp).toBeDefined();
      expect(result.timestamp >= before).toBe(true);
      expect(result.timestamp <= after).toBe(true);
    });

    it('should return error status when db connection throws', async () => {
      mockDb.checkConnection.mockRejectedValue(new Error('Supabase unavailable'));

      const result = await controller.checkSupabase();

      expect(result.status).toBe('error');
      expect(result.supabase.status).toBe('error');
      expect(result.supabase.message).toBe('Supabase unavailable');
      expect(result.timestamp).toBeDefined();
    });

    it('should handle non-Error thrown values', async () => {
      mockDb.checkConnection.mockRejectedValue('string error');

      const result = await controller.checkSupabase();

      expect(result.status).toBe('error');
      expect(result.supabase.message).toBe('Unknown error');
    });
  });

  describe('getDbConfig GET /health/db/config', () => {
    it('should return db config spread with timestamp appended', () => {
      const mockConfig = {
        provider: 'supabase',
        url: 'http://localhost:6012',
        schemas: ['public', 'orch_flow'],
        clientsAvailable: { anon: true, service: true },
      };
      mockDb.getConfig.mockReturnValue(mockConfig);

      const before = new Date().toISOString();
      const result = controller.getDbConfig();
      const after = new Date().toISOString();

      expect(result.provider).toBe('supabase');
      expect(result.url).toBe('http://localhost:6012');
      expect(result.schemas).toEqual(['public', 'orch_flow']);
      expect(result.clientsAvailable).toEqual({ anon: true, service: true });
      expect(result.timestamp).toBeDefined();
      expect(result.timestamp >= before).toBe(true);
      expect(result.timestamp <= after).toBe(true);
      expect(mockDb.getConfig).toHaveBeenCalledTimes(1);
    });
  });
});
