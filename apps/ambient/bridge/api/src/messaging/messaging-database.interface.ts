import type { QueryBuilder } from '../planes/database';

export const MESSAGING_DATABASE_SERVICE = Symbol('MESSAGING_DATABASE_SERVICE');

export interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export interface MessagingDatabaseService {
  from(schema: string | null, table: string): QueryBuilder;
}
