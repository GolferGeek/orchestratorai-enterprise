import { randomBytes } from 'node:crypto';
import { decryptCredential, encryptCredential, parseCredentialKey } from './credential-cipher';

describe('credential cipher', () => {
  const key = randomBytes(32);
  const address = { organizationSlug: 'acme', type: 'shipstation', key: 'api_key' };

  it('round-trips a value, and never stores it in the clear', () => {
    const stored = encryptCredential(key, address, 'ss-live-secret');
    expect(stored).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
    expect(stored).not.toContain('ss-live-secret');
    expect(decryptCredential(key, address, stored)).toBe('ss-live-secret');
  });

  it('encrypts the same value differently each time', () => {
    expect(encryptCredential(key, address, 'x')).not.toBe(encryptCredential(key, address, 'x'));
  });

  it.each([
    ['another organization', { ...address, organizationSlug: 'globex' }],
    ['another type', { ...address, type: 'quickbooks' }],
    ['another key', { ...address, key: 'api_secret' }],
  ])('refuses a value moved to %s', (_label, moved) => {
    const stored = encryptCredential(key, address, 'ss-live-secret');
    expect(() => decryptCredential(key, moved, stored)).toThrow('does not decrypt');
  });

  it('refuses a value encrypted under another key', () => {
    const stored = encryptCredential(randomBytes(32), address, 'ss-live-secret');
    expect(() => decryptCredential(key, address, stored)).toThrow('does not decrypt');
  });

  it('refuses a value that is not encrypted', () => {
    expect(() => decryptCredential(key, address, 'ss-live-secret')).toThrow('is not a v1 encrypted value');
  });

  it.each([['too short', randomBytes(16).toString('base64')], ['not base64', 'not-a-key'], ['empty', '']])(
    'refuses an encryption key that is %s',
    (_label, encoded) => {
      expect(() => parseCredentialKey(encoded)).toThrow('CREDENTIALS_ENCRYPTION_KEY must be 32 random bytes');
    },
  );
});
