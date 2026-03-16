import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { MessagingDatabaseService } from './messaging-database.interface';

/**
 * Supabase-backed database service scoped to the messaging module.
 * Bridge API has no shared database plane, so messaging manages its own Supabase connection.
 */
@Injectable()
export class MessagingSupabaseDatabaseService implements MessagingDatabaseService {
  private readonly logger = new Logger(MessagingSupabaseDatabaseService.name);
  private readonly client: SupabaseClient;

  constructor() {
    const url = process.env['SUPABASE_URL'] || 'http://127.0.0.1:6012';
    const key = process.env['SUPABASE_SERVICE_ROLE_KEY'] || process.env['SUPABASE_ANON_KEY'] || '';
    if (!key) {
      this.logger.warn('SUPABASE_SERVICE_ROLE_KEY not set — messaging persistence may fail');
    }
    this.client = createClient(url, key);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(schema: string | null, table: string): any {
    if (schema) {
      return this.client.schema(schema).from(table);
    }
    return this.client.from(table);
  }
}
