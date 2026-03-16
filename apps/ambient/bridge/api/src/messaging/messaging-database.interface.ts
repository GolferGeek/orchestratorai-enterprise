export const MESSAGING_DATABASE_SERVICE = Symbol('MESSAGING_DATABASE_SERVICE');

export interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QueryBuilder = any;

export interface MessagingDatabaseService {
  from(schema: string | null, table: string): QueryBuilder;
}
