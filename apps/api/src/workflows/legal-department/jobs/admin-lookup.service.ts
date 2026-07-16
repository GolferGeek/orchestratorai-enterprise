import { Inject, Injectable } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
} from '@orchestrator-ai/transport-types';

const CACHE_TTL_MS = 60_000;

@Injectable()
export class AdminLookupService {
  private readonly cache = new Map<
    string,
    { value: boolean; expiresAt: number }
  >();

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async isOrgAdmin(userId: string, orgSlug: string): Promise<boolean> {
    const key = `${userId}|${orgSlug}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const sql = `
      SELECT 1
      FROM authz.rbac_user_org_roles uor
      JOIN authz.rbac_roles r ON r.id = uor.role_id
      WHERE uor.user_id = $1
        AND (uor.organization_slug = $2 OR r.name = 'super-admin')
        AND r.name IN ('admin', 'super-admin')
      LIMIT 1
    `;
    const { data, error } = (await this.db.rawQuery(sql, [
      userId,
      orgSlug,
    ])) as {
      data: unknown[] | null;
      error: { message: string } | null;
    };
    if (error) {
      throw new Error(`AdminLookupService.isOrgAdmin failed: ${error.message}`);
    }

    const isAdmin = Array.isArray(data) && data.length > 0;
    this.cache.set(key, {
      value: isAdmin,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return isAdmin;
  }
}
