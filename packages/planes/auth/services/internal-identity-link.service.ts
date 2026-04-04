import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuthenticatedPrincipal } from '../interfaces/authenticated-principal.interface';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';

interface IdentityLinkRow {
  user_id: string;
}

/**
 * Maps external OIDC principals to internal user IDs via authz.auth_identity_links.
 *
 * Uses DATABASE_SERVICE with schema-qualified queries (.from('authz', 'auth_identity_links'))
 * so that direct Postgres is used rather than routing through PostgREST/Kong, which does
 * not support the authz schema.
 */
@Injectable()
export class InternalIdentityLinkService {
  private readonly logger = new Logger(InternalIdentityLinkService.name);

  constructor(
    @Inject(DATABASE_SERVICE)
    private readonly db: DatabaseService,
  ) {}

  async findInternalUserId(
    principal: AuthenticatedPrincipal,
  ): Promise<string | null> {
    const { data, error } = (await this.db
      .from('authz', 'auth_identity_links')
      .select('user_id')
      .eq('issuer', principal.issuer)
      .eq('subject', principal.subject)
      .maybeSingle()) as QueryResult<IdentityLinkRow>;

    if (error) {
      throw new Error(`Failed to resolve identity link: ${error.message}`);
    }

    return data?.user_id ?? null;
  }

  async upsertIdentityLink(
    userId: string,
    principal: AuthenticatedPrincipal,
  ): Promise<void> {
    const { error } = (await this.db
      .from('authz', 'auth_identity_links')
      .upsert(
        {
          user_id: userId,
          issuer: principal.issuer,
          subject: principal.subject,
          email: principal.email ?? null,
          raw_claims: principal.rawClaims,
        },
        {
          onConflict: 'issuer,subject',
        },
      )) as QueryResult<unknown>;

    if (error) {
      throw new Error(`Failed to upsert identity link: ${error.message}`);
    }

    this.logger.debug(
      `Identity link upserted for issuer=${principal.issuer} subject=${principal.subject}`,
    );
  }
}
