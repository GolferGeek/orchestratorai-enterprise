/**
 * Organization credentials against the real table: stored encrypted (the
 * column never holds the value), read back by address, listed without values,
 * removed; an unknown address is an error, not an empty value.
 *
 * Set SECURITY_TEST_DATABASE_URL to run it (skipped otherwise).
 */
import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { ConfigProvider } from '@orchestratorai/planes/config';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';
import { CredentialMissingError, OrganizationCredentialsService } from './organization-credentials.service';

const url = process.env.SECURITY_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

describeWithDb('organization credentials against Postgres', () => {
  const org = 'marketing';
  const type = `it-${randomBytes(4).toString('hex')}`;
  let db: PostgresqlDatabaseService;
  let credentials: OrganizationCredentialsService;

  beforeAll(async () => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    const key = randomBytes(32).toString('base64');
    credentials = new OrganizationCredentialsService(db, { getSecret: async () => key } as unknown as ConfigProvider);
    await credentials.onModuleInit();
  });

  afterAll(async () => {
    await db.rawQuery(`DELETE FROM public.organization_credentials WHERE credential_type = $1`, [type]);
    await db.onModuleDestroy();
  });

  it('stores a value encrypted, reads it back, lists it without the value, and removes it', async () => {
    const address = { organizationSlug: org, type, key: 'api_key' };
    await credentials.put(address, 'sandbox-secret-1', { environment: 'sandbox' });
    await credentials.put(address, 'sandbox-secret-2', { environment: 'sandbox' });

    const { data } = await db.rawQuery(
      `SELECT encrypted_value FROM public.organization_credentials WHERE organization_slug = $1 AND credential_type = $2`,
      [org, type],
    );
    const rows = data as Array<{ encrypted_value: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.encrypted_value).toMatch(/^v1:/);
    expect(rows[0]!.encrypted_value).not.toContain('sandbox-secret');

    expect(await credentials.get(address)).toBe('sandbox-secret-2');
    const listed = (await credentials.list(org)).filter((c) => c.type === type);
    expect(listed).toEqual([{ type, key: 'api_key', metadata: { environment: 'sandbox' }, updatedAt: expect.any(String) }]);
    expect(JSON.stringify(listed)).not.toContain('sandbox-secret');

    expect(await credentials.remove(address)).toBe(true);
    expect(await credentials.remove(address)).toBe(false);
    await expect(credentials.get(address)).rejects.toBeInstanceOf(CredentialMissingError);
  });

  it('refuses an address that is not one organization and two short names', async () => {
    await expect(credentials.put({ organizationSlug: '*', type, key: 'api_key' }, 'x')).rejects.toThrow('one organization');
    await expect(credentials.put({ organizationSlug: org, type: 'Ship Station', key: 'api_key' }, 'x')).rejects.toThrow('short lowercase name');
  });
});
