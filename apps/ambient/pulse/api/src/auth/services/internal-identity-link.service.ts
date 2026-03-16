import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuthenticatedPrincipal } from '../interfaces/authenticated-principal.interface';
import {
  DATABASE_PROVIDER,
  DatabaseProvider,
} from '../../data-pilot/database-provider.interface';

@Injectable()
export class InternalIdentityLinkService {
  private readonly logger = new Logger(InternalIdentityLinkService.name);

  constructor(
    @Inject(DATABASE_PROVIDER)
    private readonly databaseProvider: DatabaseProvider,
  ) {}

  async findInternalUserId(
    principal: AuthenticatedPrincipal,
  ): Promise<string | null> {
    return this.databaseProvider.findIdentityLinkUserId({
      issuer: principal.issuer,
      subject: principal.subject,
    });
  }

  async upsertIdentityLink(
    userId: string,
    principal: AuthenticatedPrincipal,
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
