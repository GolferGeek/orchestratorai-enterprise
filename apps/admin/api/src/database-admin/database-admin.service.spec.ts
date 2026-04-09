import { Test, TestingModule } from '@nestjs/testing';
import { DATABASE_SERVICE } from '@orchestrator-ai/transport-types';
import { DatabaseAdminService } from './database-admin.service';

const mockDb = {
  checkConnection: jest.fn(),
  getConfig: jest.fn(),
  rawQuery: jest.fn(),
};

describe('DatabaseAdminService', () => {
  let service: DatabaseAdminService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseAdminService,
        {
          provide: DATABASE_SERVICE,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<DatabaseAdminService>(DatabaseAdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // getHealth()
  // ---------------------------------------------------------------------------

  describe('getHealth()', () => {
    it('returns health response from db.checkConnection()', async () => {
      mockDb.checkConnection.mockResolvedValue({
        status: 'ok',
        message: 'Connection successful',
      });

      const result = await service.getHealth();

      expect(mockDb.checkConnection).toHaveBeenCalled();
      expect(result.status).toBe('ok');
      expect(result.message).toBe('Connection successful');
      expect(result.checkedAt).toBeDefined();
    });

    it('propagates errors from db.checkConnection()', async () => {
      mockDb.checkConnection.mockRejectedValue(new Error('DB unreachable'));

      await expect(service.getHealth()).rejects.toThrow('DB unreachable');
    });
  });

  // ---------------------------------------------------------------------------
  // getConfig()
  // ---------------------------------------------------------------------------

  describe('getConfig()', () => {
    it('returns database configuration from db.getConfig()', async () => {
      mockDb.getConfig.mockReturnValue({
        provider: 'supabase',
        url: 'postgresql://localhost:54322/postgres',
        schemas: ['public', 'authz', 'orch_flow'],
        clientsAvailable: { service: true, anon: true },
      });

      const result = service.getConfig();

      expect(result.provider).toBe('supabase');
      expect(result.url).toBe('postgresql://localhost:54322/postgres');
      expect(result.schemas).toContain('public');
      expect(result.clientsAvailable).toEqual({ service: true, anon: true });
      expect(result.checkedAt).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // getTables()
  // ---------------------------------------------------------------------------

  describe('getTables()', () => {
    it('maps pg_stat_user_tables rows to TableInfo objects', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: [
          { schema: 'public', name: 'users', row_count: '42' },
          { schema: 'orch_flow', name: 'tasks', row_count: '7' },
        ],
        error: null,
      });

      const result = await service.getTables();

      expect(result.totalCount).toBe(2);
      expect(result.tables[0]).toEqual({
        schema: 'public',
        name: 'users',
        rowCount: 42,
      });
      expect(result.tables[1]).toEqual({
        schema: 'orch_flow',
        name: 'tasks',
        rowCount: 7,
      });
    });

    it('throws when rawQuery returns an error', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: null,
        error: { message: 'permission denied' },
      });

      await expect(service.getTables()).rejects.toThrow(
        'Failed to query tables: permission denied',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getMigrations()
  // ---------------------------------------------------------------------------

  describe('getMigrations()', () => {
    it('maps schema_migrations rows to MigrationInfo objects', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: [
          { version: '20260101000001', name: 'create_users_table' },
          { version: '20260201000001', name: null },
        ],
        error: null,
      });

      const result = await service.getMigrations();

      expect(result.migrations).toHaveLength(2);
      expect(result.migrations[0]?.name).toBe('create_users_table');
      // When name is null, falls back to version
      expect(result.migrations[1]?.name).toBe('20260201000001');
      expect(result.migrations[0]?.success).toBe(true);
    });

    it('throws when rawQuery returns an error', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: null,
        error: { message: 'table not found' },
      });

      await expect(service.getMigrations()).rejects.toThrow(
        'Failed to query migrations: table not found',
      );
    });
  });
});
