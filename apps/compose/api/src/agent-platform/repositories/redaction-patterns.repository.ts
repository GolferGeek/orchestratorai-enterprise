import { Injectable, Inject, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';

export interface RedactionPatternRecord {
  id?: string;
  organization_slug: string | null;
  agent_slug?: string | null;
  pattern: string;
  flags?: string | null;
  replacement?: string | null;
  updated_at?: string;
}

@Injectable()
export class RedactionPatternsRepository {
  private readonly logger = new Logger(RedactionPatternsRepository.name);
  private readonly table = 'redaction_patterns';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async listByOrganization(
    orgSlug: string | null,
  ): Promise<RedactionPatternRecord[]> {
    let q = this.db.from(null, this.table).select('*');
    q = orgSlug
      ? q.eq('organization_slug', orgSlug)
      : q.is('organization_slug', null);
    const { data, error } = (await q.order('updated_at', {
      ascending: false,
    })) as {
      data: RedactionPatternRecord[] | null;
      error: { message: string } | null;
    };
    if (error) {
      this.logger.warn(
        `Failed to load redaction patterns for ${orgSlug ?? 'global'}: ${error.message}`,
      );
      return [];
    }
    return (data as RedactionPatternRecord[]) || [];
  }
}
