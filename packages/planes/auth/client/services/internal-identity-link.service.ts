import { Inject, Injectable, Logger } from '@nestjs/common';

/**
 * Minimal authenticated principal shape required to look up / upsert identity links.
 * Products pass their own principal DTO which satisfies this interface structurally.
 */
export interface IdentityLinkPrincipal {
  issuer: string;
  subject: string;
  email?: string | null;
  rawClaims: Record<string, unknown>;
}

/**
 * Minimal database provider interface required by InternalIdentityLinkService.
 *
 * Products inject a concrete DatabaseProvider that implements this interface
 * (along with any additional product-specific methods) using the
 * IDENTITY_LINK_DATABASE_PROVIDER token exported from this module.
 */
export interface IdentityLinkDatabaseProvider {
  findIdentityLinkUserId(input: {
    issuer: string;
    subject: string;
  }): Promise<string | null>;
  upsertIdentityLink(input: {
    userId: string;
    issuer: string;
    subject: string;
    email: string | null;
    rawClaims: Record<string, unknown>;
  }): Promise<void>;
}

/** Injection token for the identity-link database provider. */
export const IDENTITY_LINK_DATABASE_PROVIDER = Symbol(
  'IDENTITY_LINK_DATABASE_PROVIDER',
);

@Injectable()
export class InternalIdentityLinkService {
  private readonly logger = new Logger(InternalIdentityLinkService.name);

  constructor(
    @Inject(IDENTITY_LINK_DATABASE_PROVIDER)
    private readonly databaseProvider: IdentityLinkDatabaseProvider,
  ) {}

  async findInternalUserId(
    principal: IdentityLinkPrincipal,
  ): Promise<string | null> {
    return this.databaseProvider.findIdentityLinkUserId({
      issuer: principal.issuer,
      subject: principal.subject,
    });
  }

  async upsertIdentityLink(
    userId: string,
    principal: IdentityLinkPrincipal,
  ): Promise<void> {
    await this.databaseProvider.upsertIdentityLink({
      userId,
      issuer: principal.issuer,
      subject: principal.subject,
      email: principal.email ?? null,
      rawClaims: principal.rawClaims,
    });

    this.logger.debug(
      `Identity link upserted for issuer=${principal.issuer} subject=${principal.subject}`,
    );
  }
}
