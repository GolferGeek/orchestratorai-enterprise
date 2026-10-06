import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM for organization credentials. A stored value is
 * `v1:<iv>:<tag>:<ciphertext>` (base64 parts). The organization, type and key
 * are the additional authenticated data, so a value copied onto another row
 * (or another organization) does not decrypt.
 */
const VERSION = 'v1';

/** Where a credential belongs; bound into its ciphertext. */
export interface CredentialAddress {
  organizationSlug: string;
  type: string;
  key: string;
}

/** The 32-byte key from its base64 form. Throws on anything else. */
export function parseCredentialKey(encoded: string): Buffer {
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded.trim()) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY must be 32 random bytes, base64 encoded (openssl rand -base64 32)');
  }
  return key;
}

function aad(address: CredentialAddress): Buffer {
  return Buffer.from(JSON.stringify([address.organizationSlug, address.type, address.key]));
}

export function encryptCredential(key: Buffer, address: CredentialAddress, value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad(address));
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

/** Throws when the value is malformed, was encrypted under another key, or belongs to another address. */
export function decryptCredential(key: Buffer, address: CredentialAddress, stored: string): string {
  const [version, iv, tag, data, ...rest] = stored.split(':');
  if (version !== VERSION || !iv || !tag || data === undefined || rest.length > 0) {
    throw new Error(`Credential ${address.type}/${address.key} of ${address.organizationSlug} is not a ${VERSION} encrypted value`);
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAAD(aad(address));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  try {
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error(
      `Credential ${address.type}/${address.key} of ${address.organizationSlug} does not decrypt: another encryption key, or it was moved from another row`,
    );
  }
}
