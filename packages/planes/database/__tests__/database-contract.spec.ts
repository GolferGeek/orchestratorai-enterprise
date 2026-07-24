/**
 * Contract parity tests: verify that SupabaseDatabaseService and
 * SqlServerDatabaseService produce equivalent QueryResult shapes
 * for the same logical operations.
 *
 * These tests verify the interface contract, NOT actual database calls.
 * Each provider is given mocked responses and we verify both return
 * the same QueryResult structure.
 */
import { DatabaseService, QueryResult } from '../database.interface';
import { SupabaseDatabaseService } from '../supabase-database.service';
import { SqlServerDatabaseService } from '../sqlserver-database.service';
import { PostgresqlDatabaseService } from '../postgresql-database.service';
import { ConfigService } from '@nestjs/config';
import * as mssql from 'mssql';

jest.mock('mssql', () => {
  const actual = jest.requireActual('mssql');
  return {
    ...actual,
    ConnectionPool: jest.fn(),
  };
});

interface ContractHarness {
  provider: DatabaseService;
  setSelectResult: (rows: unknown[], count?: number) => void;
  setSelectEmpty: () => void;
  setSingleResult: (row: unknown) => void;
  setInsertResult: (row: unknown) => void;
  setError: (message: string) => void;
  reset: () => void;
}

function createSupabaseHarness(): ContractHarness {
  const queryMock = jest.fn();
  const releaseMock = jest.fn();
  const clientMock = {
    query: queryMock,
    release: releaseMock,
  };

  const supabaseService = {
    checkConnection: jest.fn(async () => ({
      status: 'ok',
      message: 'OK',
    })),
    getConfig: jest.fn(() => ({
      url: 'http://test-supabase-host',
      coreSchema: 'public',
      companySchema: 'company',
      clientsAvailable: { service: true, anon: true },
    })),
  } as any;

  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'DATABASE_URL')
        return 'postgresql://postgres:postgres@test-db-host:5432/postgres';
      return undefined;
    }),
  } as any;

  const provider = new SupabaseDatabaseService(supabaseService, configService);
  (
    provider as unknown as {
      pool: { connect: jest.Mock };
    }
  ).pool = { connect: jest.fn(async () => clientMock) };

  return {
    provider,
    setSelectResult: (rows, count) => {
      queryMock.mockResolvedValueOnce({
        rows,
        rowCount: count ?? rows.length,
      });
    },
    setSelectEmpty: () => {
      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    },
    setSingleResult: (row) => {
      queryMock.mockResolvedValueOnce({ rows: [row], rowCount: 1 });
    },
    setInsertResult: (row) => {
      queryMock.mockResolvedValueOnce({ rows: [row], rowCount: 1 });
    },
    setError: (message) => {
      queryMock.mockRejectedValueOnce(new Error(message));
    },
    reset: () => {
      jest.clearAllMocks();
    },
  };
}

function createSqlServerHarness(): ContractHarness {
  const queryMock = jest.fn();
  const inputMock = jest.fn();
  const requestMock = jest.fn(() => ({
    input: inputMock,
    query: queryMock,
    execute: jest.fn(),
  }));
  const connectMock = jest.fn(async () => ({
    request: requestMock,
    connected: true,
  }));

  (mssql.ConnectionPool as unknown as jest.Mock).mockImplementation(() => ({
    connect: connectMock,
    connected: false,
  }));

  const configValues: Record<string, string> = {
    SQLSERVER_HOST: 'test-sqlserver-host',
    SQLSERVER_PORT: '1433',
    SQLSERVER_DATABASE: 'test_db',
    SQLSERVER_USER: 'sa',
    SQLSERVER_PASSWORD: 'pass',
    SQLSERVER_ENCRYPT: 'false',
    SQLSERVER_TRUST_SERVER_CERT: 'true',
  };

  const configService = {
    get: jest.fn(
      (key: string, defaultVal?: string) => configValues[key] ?? defaultVal,
    ),
    getOrThrow: jest.fn((key: string) => {
      if (!configValues[key]) throw new Error(`Missing ${key}`);
      return configValues[key];
    }),
  } as unknown as ConfigService;

  return {
    provider: new SqlServerDatabaseService(configService),
    setSelectResult: (rows, count) => {
      const recordset = count
        ? rows.map((r) => ({ ...(r as any), __total_count: count }))
        : rows;
      queryMock.mockResolvedValueOnce({ recordset });
    },
    setSelectEmpty: () => {
      queryMock.mockResolvedValueOnce({ recordset: [] });
    },
    setSingleResult: (row) => {
      queryMock.mockResolvedValueOnce({ recordset: [row] });
    },
    setInsertResult: (row) => {
      queryMock.mockResolvedValueOnce({ recordset: [row] });
    },
    setError: (message) => {
      queryMock.mockRejectedValueOnce(new Error(message));
    },
    reset: () => {
      jest.clearAllMocks();
    },
  };
}

function createPostgresqlHarness(): ContractHarness {
  const queryMock = jest.fn();
  const releaseMock = jest.fn();
  const clientMock = {
    query: queryMock,
    release: releaseMock,
  };
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'POSTGRESQL_URL') {
        return 'postgresql://postgres:postgres@test-db-host:5432/postgres';
      }
      return undefined;
    }),
  } as unknown as ConfigService;
  const provider = new PostgresqlDatabaseService(configService);
  (
    provider as unknown as {
      pool: { connect: jest.Mock };
    }
  ).pool = { connect: jest.fn(async () => clientMock) };

  return {
    provider,
    setSelectResult: (rows, count) => {
      queryMock.mockResolvedValueOnce({
        rows,
        rowCount: count ?? rows.length,
      });
    },
    setSelectEmpty: () => {
      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    },
    setSingleResult: (row) => {
      queryMock.mockResolvedValueOnce({ rows: [row], rowCount: 1 });
    },
    setInsertResult: (row) => {
      queryMock.mockResolvedValueOnce({ rows: [row], rowCount: 1 });
    },
    setError: (message) => {
      queryMock.mockRejectedValueOnce(new Error(message));
    },
    reset: () => {
      jest.clearAllMocks();
    },
  };
}

describe.each([
  ['supabase', createSupabaseHarness],
  ['sqlserver', createSqlServerHarness],
  ['postgresql', createPostgresqlHarness],
])('DatabaseService contract parity (%s)', (_name, makeHarness) => {
  let harness: ContractHarness;

  beforeEach(() => {
    harness = makeHarness();
  });

  afterEach(() => {
    harness.reset();
  });

  it('select returns QueryResult with data array', async () => {
    const rows = [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ];
    harness.setSelectResult(rows);

    const result: QueryResult = await harness.provider
      .from(null, 'users')
      .select('*');

    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as any[]).length).toBe(2);
  });

  it('select with no results returns empty array', async () => {
    harness.setSelectEmpty();

    const result: QueryResult = await harness.provider
      .from(null, 'users')
      .select('*');

    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as any[]).length).toBe(0);
  });

  it('single returns QueryResult with single object', async () => {
    harness.setSingleResult({ id: '1', name: 'Alice' });

    const result: QueryResult = await harness.provider
      .from(null, 'users')
      .select('*')
      .eq('id', '1')
      .single();

    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
    expect(result.data.id).toBe('1');
  });

  it('insert returns QueryResult with inserted row', async () => {
    harness.setInsertResult({ id: 'new-1', name: 'Charlie' });

    const result: QueryResult = await harness.provider
      .from(null, 'users')
      .insert({ name: 'Charlie' })
      .select('*')
      .single();

    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
    expect(result.data.name).toBe('Charlie');
  });

  it('error returns QueryResult with error and null data', async () => {
    harness.setError('Something went wrong');

    const result: QueryResult = await harness.provider
      .from(null, 'users')
      .select('*');

    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.error!.message).toContain('Something went wrong');
  });

  it('getConfig returns provider metadata', () => {
    const config = harness.provider.getConfig();

    expect(config.provider).toBeDefined();
    expect(typeof config.url).toBe('string');
    expect(Array.isArray(config.schemas)).toBe(true);
    expect(typeof config.clientsAvailable.service).toBe('boolean');
  });
});
