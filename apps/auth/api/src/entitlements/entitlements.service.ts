import {
  Injectable,
  Inject,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';

export interface Entitlement {
  id: string;
  orgSlug: string;
  product: string;
  grantedAt: string;
  grantedBy?: string;
}

export interface GrantEntitlementDto {
  product: string;
}

const VALID_PRODUCTS = [
  'forge',
  'compose',
  'pulse',
  'bridge',
  'protocol-lab',
  'assistant',
] as const;
type ValidProduct = (typeof VALID_PRODUCTS)[number];

interface OrgEntitlementRow {
  id: string;
  org_slug: string;
  product: string;
  granted_at: string;
  granted_by?: string | null;
}

@Injectable()
export class EntitlementsService {
  private readonly logger = new Logger(EntitlementsService.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * List all entitlements for an organization
   */
  async findByOrg(orgSlug: string): Promise<Entitlement[]> {
    const { data, error } = (await this.db
      .from('authz', 'org_entitlements')
      .select('*')
      .eq('org_slug', orgSlug)
      .order('granted_at')) as {
      data: OrgEntitlementRow[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      this.logger.error(
        `Failed to fetch entitlements for org '${orgSlug}': ${error.message}`,
      );
      throw new HttpException(
        `Failed to fetch entitlements: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return (data || []).map((row) => this.toEntitlement(row));
  }

  /**
   * Grant a product entitlement to an organization.
   * Idempotent: returns the existing row if the grant already exists.
   */
  async grant(
    orgSlug: string,
    dto: GrantEntitlementDto,
    grantedBy: string,
  ): Promise<Entitlement> {
    if (!VALID_PRODUCTS.includes(dto.product as ValidProduct)) {
      throw new HttpException(
        `Invalid product '${dto.product}'. Must be one of: ${VALID_PRODUCTS.join(', ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Upsert — if already granted, return the existing row
    const { data, error } = (await this.db
      .from('authz', 'org_entitlements')
      .upsert(
        {
          org_slug: orgSlug,
          product: dto.product,
          granted_by: grantedBy,
        },
        { onConflict: 'org_slug,product' },
      )
      .select()
      .single()) as {
      data: OrgEntitlementRow | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      this.logger.error(
        `Failed to grant entitlement '${dto.product}' to org '${orgSlug}': ${error.message}`,
      );
      throw new HttpException(
        `Failed to grant entitlement: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    this.logger.log(
      `Granted '${dto.product}' to org '${orgSlug}' by user '${grantedBy}'`,
    );
    return this.toEntitlement(data as OrgEntitlementRow);
  }

  /**
   * Revoke a product entitlement from an organization
   */
  async revoke(orgSlug: string, product: string): Promise<void> {
    if (!VALID_PRODUCTS.includes(product as ValidProduct)) {
      throw new HttpException(
        `Invalid product '${product}'. Must be one of: ${VALID_PRODUCTS.join(', ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const { error } = (await this.db
      .from('authz', 'org_entitlements')
      .delete()
      .eq('org_slug', orgSlug)
      .eq('product', product)) as {
      data: unknown;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      this.logger.error(
        `Failed to revoke entitlement '${product}' from org '${orgSlug}': ${error.message}`,
      );
      throw new HttpException(
        `Failed to revoke entitlement: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    this.logger.log(`Revoked '${product}' from org '${orgSlug}'`);
  }

  private toEntitlement(row: OrgEntitlementRow): Entitlement {
    return {
      id: row.id,
      orgSlug: row.org_slug,
      product: row.product,
      grantedAt: row.granted_at,
      grantedBy: row.granted_by ?? undefined,
    };
  }
}
