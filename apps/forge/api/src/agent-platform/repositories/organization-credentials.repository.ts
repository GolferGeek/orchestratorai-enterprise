import { Injectable, Inject, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  OrganizationCredentialRecord,
  OrganizationCredentialUpsertInput,
} from '../interfaces/organization-credential-record.interface';

interface SupabaseResponse<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

const TABLE = 'organization_credentials';

@Injectable()
export class OrganizationCredentialsRepository {
  private readonly logger = new Logger(OrganizationCredentialsRepository.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async upsert(
    payload: OrganizationCredentialUpsertInput,
  ): Promise<OrganizationCredentialRecord> {
    const now = new Date().toISOString();
    const { data, error } = (await this.db
      .from(null, TABLE)
      .upsert(
        [
          {
            organization_slug: payload.organization_slug,
            alias: payload.alias,
            credential_type: payload.credential_type,
            encrypted_value: payload.encrypted_value,
            encryption_metadata: payload.encryption_metadata ?? {},
            rotated_at: payload.rotated_at ?? null,
            updated_at: now,
          },
        ],
        { onConflict: 'organization_slug,alias' },
      )
      .select()
      .maybeSingle()) as SupabaseResponse<OrganizationCredentialRecord>;

    if (error) {
      this.logger.error(
        `Failed to upsert credential ${payload.organization_slug}/${payload.alias}: ${error.message}`,
      );
      throw new Error(`Failed to upsert credential: ${error.message}`);
    }

    if (!data) {
      throw new Error('Credential upsert succeeded but returned no data');
    }

    return data;
  }

  async get(
    organizationSlug: string,
    alias: string,
  ): Promise<OrganizationCredentialRecord | null> {
    const { data, error } = (await this.db
      .from(null, TABLE)
      .select('*')
      .eq('organization_slug', organizationSlug)
      .eq('alias', alias)
      .maybeSingle()) as SupabaseResponse<OrganizationCredentialRecord>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(
        `Failed to fetch credential ${organizationSlug}/${alias}: ${error.message}`,
      );
      throw new Error(`Failed to fetch credential: ${error.message}`);
    }

    return data;
  }

  async listByOrganization(
    organizationSlug: string,
  ): Promise<OrganizationCredentialRecord[]> {
    const { data, error } = (await this.db
      .from(null, TABLE)
      .select('*')
      .eq('organization_slug', organizationSlug)
      .order('alias', { ascending: true })) as {
      data: OrganizationCredentialRecord[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      this.logger.error(
        `Failed to list credentials for ${organizationSlug}: ${error.message}`,
      );
      throw new Error(`Failed to list credentials: ${error.message}`);
    }

    return data ?? [];
  }

  async delete(organizationSlug: string, alias: string): Promise<void> {
    const { error } = await this.db
      .from(null, TABLE)
      .delete()
      .eq('organization_slug', organizationSlug)
      .eq('alias', alias);

    if (error) {
      this.logger.error(
        `Failed to delete credential ${organizationSlug}/${alias}: ${error.message}`,
      );
      throw new Error(`Failed to delete credential: ${error.message}`);
    }
  }
}
