import { Injectable, Inject } from '@nestjs/common';
import { DATABASE_SERVICE } from '@orchestratorai/planes/database';
import type { DatabaseService, QueryBuilder } from '@orchestratorai/planes/database';
import { MessagingDatabaseService } from './messaging-database.interface';

/**
 * MessagingSupabaseDatabaseService
 *
 * Implements MessagingDatabaseService using the DATABASE_SERVICE injection token.
 * Delegates schema-qualified table access to the platform database plane so
 * the underlying provider (Supabase, PostgreSQL, SQL Server) is selected
 * at deploy time — no raw Supabase client here.
 */
@Injectable()
export class MessagingSupabaseDatabaseService implements MessagingDatabaseService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
  ) {}

  from(schema: string | null, table: string): QueryBuilder {
    return this.db.from(schema, table);
  }
}
