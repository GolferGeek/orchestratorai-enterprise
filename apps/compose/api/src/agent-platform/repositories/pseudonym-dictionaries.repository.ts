import { Injectable, Inject, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';

export interface PseudonymDictionaryRecord {
  id?: string;
  organization_slug: string | null;
  agent_slug?: string | null;
  data_type?: string | null; // e.g., name, email, ssn
  original?: string | null;
  pseudonym?: string | null;
  updated_at?: string;
}

@Injectable()
export class PseudonymDictionariesRepository {
  private readonly logger = new Logger(PseudonymDictionariesRepository.name);
  private readonly table = 'pseudonym_dictionaries';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async listByOrganization(
    orgSlug: string | null,
  ): Promise<PseudonymDictionaryRecord[]> {
    let q = this.db.from(null, this.table).select('*');
    q = orgSlug
      ? q.eq('organization_slug', orgSlug)
      : q.is('organization_slug', null);
    const { data, error } = (await q.order('updated_at', {
      ascending: false,
    })) as {
      data: PseudonymDictionaryRecord[] | null;
      error: { message: string } | null;
    };
    if (error) {
      this.logger.warn(
        `Failed to load pseudonym dictionary for ${orgSlug ?? 'global'}: ${error.message}`,
      );
      return [];
    }
    return (data as PseudonymDictionaryRecord[]) || [];
  }
}
