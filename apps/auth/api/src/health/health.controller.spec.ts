import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { DATABASE_SERVICE } from '@/database';

const mockDb = {
  checkConnection: jest.fn(),
  getConfig: jest.fn(),
  from: jest.fn(),
  rpc: jest.fn(),
};

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    jest.clearAllMocks();

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

  describe('healthCheck (GET /health)', () => {
    it('should return healthy status', () => {
      const result = controller.healthCheck();

      expect(result.status).toBe('healthy');
      expect(result.service).toBe('NestJS A2A Agent Framework');
    });

    it('should return a valid ISO timestamp', () => {
      const result = controller.healthCheck();

      const timestamp = new Date(result.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(isNaN(timestamp.getTime())).toBe(false);
    });

    it('should return current timestamp (within 1 second)', () => {
      const before = Date.now();
      const result = controller.healthCheck();
      const after = Date.now();

      const timestamp = new Date(result.timestamp).getTime();
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('checkDbConnection (GET /health/db)', () => {
    it('should return successful database connection status', async () => {
      const dbStatus = {
        status: 'ok',
        message: 'Database connection successful',
      };
      mockDb.checkConnection.mockResolvedValue(dbStatus);

      const result = await controller.checkDbConnection();

      expect(result).toEqual(dbStatus);
      expect(mockDb.checkConnection).toHaveBeenCalledTimes(1);
    });

    it('should propagate connection errors from database service', async () => {
      const errorStatus = { status: 'error', message: 'Connection refused' };
      mockDb.checkConnection.mockResolvedValue(errorStatus);

      const result = await controller.checkDbConnection();

      expect(result.status).toBe('error');
    });

    it('should call db.checkConnection with no arguments', async () => {
      mockDb.checkConnection.mockResolvedValue({ status: 'ok' });

      await controller.checkDbConnection();

      expect(mockDb.checkConnection).toHaveBeenCalledWith();
    });
  });

  describe('checkSupabase (GET /health/supabase)', () => {
    it('should return ok status when database is healthy', async () => {
      const dbResult = { status: 'ok', message: 'Connected' };
      mockDb.checkConnection.mockResolvedValue(dbResult);

      const result = await controller.checkSupabase();

      expect(result.status).toBe('ok');
      expect(result.supabase).toEqual(dbResult);
      expect(result.timestamp).toBeDefined();
    });

    it('should return error status when checkConnection throws', async () => {
      mockDb.checkConnection.mockRejectedValue(
        new Error('Cannot connect to Supabase'),
      );

      const result = await controller.checkSupabase();

      expect(result.status).toBe('error');
      expect(result.supabase.status).toBe('error');
      expect(result.supabase.message).toContain('Cannot connect to Supabase');
    });

    it('should include timestamp in response', async () => {
      mockDb.checkConnection.mockResolvedValue({ status: 'ok' });

      const result = await controller.checkSupabase();

      const timestamp = new Date(result.timestamp);
      expect(isNaN(timestamp.getTime())).toBe(false);
    });

    it('should handle non-Error exceptions gracefully', async () => {
      mockDb.checkConnection.mockRejectedValue('string error');

      const result = await controller.checkSupabase();

      expect(result.status).toBe('error');
      expect(result.supabase.message).toBe('Unknown error');
    });
  });

  describe('getDbConfig (GET /health/db/config)', () => {
    it('should return database configuration with timestamp', () => {
      const dbConfig = {
        url: 'http://localhost:6012...',
        coreSchema: 'public',
        companySchema: 'company',
        clientsAvailable: { anon: true, service: true },
      };
      mockDb.getConfig.mockReturnValue(dbConfig);

      const result = controller.getDbConfig();

      expect(result.url).toBe('http://localhost:6012...');
      expect(result.clientsAvailable).toEqual({ anon: true, service: true });
      expect(result.timestamp).toBeDefined();
    });

    it('should merge db config with timestamp', () => {
      const dbConfig = {
        url: 'https://prod.supabase.co...',
        coreSchema: 'public',
        clientsAvailable: { anon: true, service: true },
      };
      mockDb.getConfig.mockReturnValue(dbConfig);

      const before = Date.now();
      const result = controller.getDbConfig();
      const after = Date.now();

      const timestamp = new Date(result.timestamp).getTime();
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });
});
