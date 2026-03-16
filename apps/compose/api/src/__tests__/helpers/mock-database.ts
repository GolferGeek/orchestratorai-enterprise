/**
 * Mock DatabaseService provider for test specs.
 *
 * Usage in test modules:
 * ```typescript
 * import { createMockDatabaseProvider, createMockQueryBuilder } from '@/__tests__/helpers/mock-database';
 *
 * const module = await Test.createTestingModule({
 *   providers: [
 *     SomeService,
 *     createMockDatabaseProvider(),
 *   ],
 * }).compile();
 * ```
 */
import { DATABASE_SERVICE } from '@/database';

/**
 * Creates a chainable mock query builder that mimics QueryBuilder behavior.
 * All chain methods return `this` for chaining.
 * When awaited (via `then`), resolves with the provided default values.
 */
export function createMockQueryBuilder(
  resolveWith: { data?: unknown; error?: unknown; count?: number | null } = {},
) {
  const defaults = { data: null, error: null, ...resolveWith };

  const builder: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    overlaps: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    like: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    filter: jest.fn().mockReturnThis(),
    match: jest.fn().mockReturnThis(),
    textSearch: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockReturnThis(),
    then: jest.fn((resolve: (value: typeof defaults) => unknown) =>
      resolve(defaults),
    ),
  };

  return builder;
}

/**
 * Creates a NestJS provider for DATABASE_SERVICE with a mock implementation.
 * The mock's `from()` returns a chainable query builder.
 */
export function createMockDatabaseProvider(resolveWith?: {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}) {
  const queryBuilder = createMockQueryBuilder(resolveWith);

  return {
    provide: DATABASE_SERVICE,
    useValue: {
      from: jest.fn().mockReturnValue(queryBuilder),
      rpc: jest
        .fn()
        .mockResolvedValue({ data: null, error: null, ...resolveWith }),
      checkConnection: jest
        .fn()
        .mockResolvedValue({ status: 'ok', message: 'ok' }),
      getConfig: jest.fn().mockReturnValue({
        provider: 'test',
        url: 'test://...',
        schemas: ['public'],
        clientsAvailable: { service: true, anon: true },
      }),
    },
  };
}
