/**
 * DatabaseService — general-purpose database abstraction.
 *
 * Services inject DATABASE_SERVICE and call:
 *   db.from('prediction', 'targets').select('*').eq('is_active', true)
 *
 * The returned QueryBuilder is chainable and PromiseLike — just await it.
 * Implementations: SupabaseDatabaseService, SqlServerDatabaseService, PostgresqlDatabaseService.
 */

export const DATABASE_SERVICE = Symbol('DATABASE_SERVICE');

/** Standard query result shape — { data, error, count } */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface QueryResult<T = any> {
  data: T | null;
  error: { message: string; code?: string; details?: string } | null;
  count?: number | null;
}

/**
 * Chainable query builder.
 *
 * All filter/modifier methods return `this` for chaining.
 * The builder is PromiseLike — awaiting it executes the query and
 * resolves with QueryResult.
 */
export interface QueryBuilder extends PromiseLike<QueryResult> {
  // Data operations
  select(
    columns?: string,
    options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean },
  ): QueryBuilder;
  insert(data: unknown): QueryBuilder;
  update(data: unknown): QueryBuilder;
  upsert(
    data: unknown,
    options?: {
      onConflict?: string;
      ignoreDuplicates?: boolean;
      count?: 'exact' | 'planned' | 'estimated';
    },
  ): QueryBuilder;
  delete(
    options?: { count?: 'exact' | 'planned' | 'estimated' },
  ): QueryBuilder;

  // Filters
  eq(column: string, value: unknown): QueryBuilder;
  neq(column: string, value: unknown): QueryBuilder;
  gt(column: string, value: unknown): QueryBuilder;
  gte(column: string, value: unknown): QueryBuilder;
  lt(column: string, value: unknown): QueryBuilder;
  lte(column: string, value: unknown): QueryBuilder;
  in(column: string, values: unknown[]): QueryBuilder;
  is(column: string, value: null | boolean): QueryBuilder;
  not(column: string, operator: string, value: unknown): QueryBuilder;
  contains(column: string, value: unknown): QueryBuilder;
  overlaps(column: string, value: unknown[]): QueryBuilder;
  ilike(column: string, pattern: string): QueryBuilder;
  or(filters: string): QueryBuilder;
  like(column: string, pattern: string): QueryBuilder;
  filter(column: string, operator: string, value: unknown): QueryBuilder;
  match(query: Record<string, unknown>): QueryBuilder;
  textSearch(
    column: string,
    query: string,
    options?: { type?: 'plain' | 'phrase' | 'websearch'; config?: string },
  ): QueryBuilder;

  // Modifiers
  order(column: string, options?: { ascending?: boolean }): QueryBuilder;
  limit(count: number): QueryBuilder;
  range(from: number, to: number): QueryBuilder;
  single(): QueryBuilder;
  maybeSingle(): QueryBuilder;
}

export interface DatabaseService {
  /**
   * Start building a query against a table.
   * @param schema  Schema name ('prediction', 'risk', etc.) or null for public
   * @param table   Table name
   */
  from(schema: string | null, table: string): QueryBuilder;

  /**
   * Call a stored procedure / RPC function.
   * @param functionName  Function name (optionally schema-qualified)
   * @param args          Named arguments
   * @param schema        Schema name or null for public
   */
  rpc(
    functionName: string,
    args?: Record<string, unknown>,
    schema?: string | null,
  ): Promise<QueryResult>;

  /** Execute a raw SQL query with parameterized inputs. */
  rawQuery(sql: string, params?: unknown[]): Promise<QueryResult>;

  /**
   * Run `work` in one database transaction. Every query made through the
   * `tx` service it receives commits together, or none does: throwing from
   * `work` (or any query error it throws on) rolls everything back. Queries
   * made through the outer service are not part of it. Nesting is an error.
   */
  transaction<T>(work: (tx: DatabaseService) => Promise<T>): Promise<T>;

  /** Health check */
  checkConnection(): Promise<{ status: string; message: string }>;

  /** Provider metadata */
  getConfig(): {
    provider: string;
    url: string;
    schemas: string[];
    clientsAvailable: { service: boolean; anon: boolean };
  };
}
