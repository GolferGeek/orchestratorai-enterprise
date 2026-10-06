import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { DATABASE_SERVICE, type DatabaseService, type JsonValue } from '@orchestrator-ai/transport-types';
import { CONFIG_PROVIDER_SERVICE, type ConfigProvider } from '@orchestratorai/planes/config';
import { decryptCredential, encryptCredential, parseCredentialKey, type CredentialAddress } from './credential-cipher';

/** No credential stored at that address. */
export class CredentialMissingError extends Error {
  constructor(address: CredentialAddress) {
    super(`Organization ${address.organizationSlug} has no ${address.type}/${address.key} credential`);
    this.name = 'CredentialMissingError';
  }
}

/** What anyone but the code that uses a credential may see of it: never its value. */
export interface CredentialListing {
  type: string;
  key: string;
  metadata: JsonValue;
  updatedAt: string;
}

const NAME = /^[a-z0-9][a-z0-9_.-]{0,63}$/;

/**
 * An organization's secrets for outside systems (ShipStation, QuickBooks...),
 * in public.organization_credentials, encrypted with AES-256-GCM under
 * CREDENTIALS_ENCRYPTION_KEY (a secret from the config plane; required). Only
 * `get` returns a value, to the server code that calls the outside system;
 * listings show names and metadata only.
 */
@Injectable()
export class OrganizationCredentialsService implements OnModuleInit {
  private key!: Buffer;

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    @Inject(CONFIG_PROVIDER_SERVICE) private readonly config: ConfigProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    this.key = parseCredentialKey(await this.config.getSecret('CREDENTIALS_ENCRYPTION_KEY'));
  }

  async put(address: CredentialAddress, value: string, metadata: JsonValue = {}): Promise<void> {
    checkAddress(address);
    if (value.length === 0) throw new Error('A credential value cannot be empty');
    const { error } = await this.db
      .from(null, 'organization_credentials')
      .upsert(
        {
          organization_slug: address.organizationSlug,
          credential_type: address.type,
          credential_key: address.key,
          encrypted_value: encryptCredential(this.key, address, value),
          metadata,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_slug,credential_type,credential_key' },
      )
      .select('id');
    if (error) throw new Error(`Failed to store ${address.type}/${address.key} for ${address.organizationSlug}: ${error.message}`);
  }

  /** The value, for server code calling the outside system. Throws CredentialMissingError when absent. */
  async get(address: CredentialAddress): Promise<string> {
    const { data, error } = await this.db
      .from(null, 'organization_credentials')
      .select('encrypted_value')
      .eq('organization_slug', address.organizationSlug)
      .eq('credential_type', address.type)
      .eq('credential_key', address.key);
    if (error) throw new Error(`Failed to read ${address.type}/${address.key} of ${address.organizationSlug}: ${error.message}`);
    const row = (data as Array<{ encrypted_value: string }> | null)?.[0];
    if (!row) throw new CredentialMissingError(address);
    return decryptCredential(this.key, address, row.encrypted_value);
  }

  async list(organizationSlug: string): Promise<CredentialListing[]> {
    const { data, error } = await this.db
      .from(null, 'organization_credentials')
      .select('credential_type, credential_key, metadata, updated_at')
      .eq('organization_slug', organizationSlug)
      .order('credential_type')
      .order('credential_key');
    if (error) throw new Error(`Failed to list the credentials of ${organizationSlug}: ${error.message}`);
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      type: String(row.credential_type),
      key: String(row.credential_key),
      metadata: (row.metadata ?? {}) as JsonValue,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    }));
  }

  /** True when there was one to remove. */
  async remove(address: CredentialAddress): Promise<boolean> {
    const { data, error } = await this.db
      .from(null, 'organization_credentials')
      .delete()
      .eq('organization_slug', address.organizationSlug)
      .eq('credential_type', address.type)
      .eq('credential_key', address.key)
      .select('id');
    if (error) throw new Error(`Failed to remove ${address.type}/${address.key} of ${address.organizationSlug}: ${error.message}`);
    return Array.isArray(data) && data.length > 0;
  }
}

/** Type and key are short lowercase names (shipstation / api_key); an organization is a real one, not '*'. */
export function checkAddress(address: CredentialAddress): void {
  if (!address.organizationSlug || address.organizationSlug === '*') {
    throw new Error('A credential belongs to one organization');
  }
  for (const [label, name] of [['type', address.type], ['key', address.key]] as const) {
    if (!NAME.test(name)) throw new Error(`Credential ${label} "${name}" must be a short lowercase name (a-z, 0-9, _ . -)`);
  }
}
