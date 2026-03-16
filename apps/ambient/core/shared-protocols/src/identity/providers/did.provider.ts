import * as crypto from 'crypto';
import { IIdentityProvider, AgentIdentity } from '../identity.interface';

export class DIDIdentityProvider implements IIdentityProvider {
  readonly providerId = 'did';

  private privateKey: crypto.KeyObject | null = null;
  private publicKeyObj: crypto.KeyObject | null = null;
  private identities: Map<string, AgentIdentity> = new Map();
  private publicKeyBase58: string | null = null;

  async generateIdentity(): Promise<AgentIdentity> {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

    this.privateKey = privateKey;
    this.publicKeyObj = publicKey;

    // Export raw public key bytes (32 bytes for Ed25519)
    const rawPublicKey = publicKey.export({ type: 'spki', format: 'der' });
    // DER-encoded SPKI for Ed25519 has a 12-byte header; raw key is the last 32 bytes
    const rawKeyBytes = rawPublicKey.subarray(rawPublicKey.length - 32);

    // Build multicodec-prefixed key: 0xed 0x01 + raw 32-byte key
    const multicodecPrefixed = Buffer.concat([Buffer.from([0xed, 0x01]), rawKeyBytes]);
    const publicKeyBase58 = this.toBase58(multicodecPrefixed);
    this.publicKeyBase58 = publicKeyBase58;

    const did = `did:key:z${publicKeyBase58}`;

    const identity: AgentIdentity = {
      id: did,
      publicKey: publicKeyBase58,
      algorithm: 'Ed25519',
      createdAt: new Date().toISOString(),
    };

    this.identities.set(did, identity);
    return identity;
  }

  async sign(message: string): Promise<string> {
    if (!this.privateKey) {
      throw new Error('No identity generated. Call generateIdentity() first.');
    }

    const signature = crypto.sign(null, Buffer.from(message), this.privateKey);
    return this.toBase64Url(signature);
  }

  async verify(message: string, signature: string, publicKey: string): Promise<boolean> {
    // Find the identity matching the given publicKey (base58-encoded)
    const storedIdentity = Array.from(this.identities.values()).find(
      (id) => id.publicKey === publicKey,
    );

    if (!storedIdentity) {
      return false;
    }

    // Decode the base58 multicodec-prefixed key to reconstruct the public KeyObject
    const multicodecBytes = this.fromBase58(publicKey);
    // Strip the 2-byte multicodec prefix (0xed 0x01)
    const rawKeyBytes = multicodecBytes.subarray(2);

    // Rebuild the DER-encoded SPKI structure for Ed25519
    // Ed25519 SPKI header: 30 2a 30 05 06 03 2b 65 70 03 21 00
    const spkiHeader = Buffer.from('302a300506032b6570032100', 'hex');
    const spkiDer = Buffer.concat([spkiHeader, rawKeyBytes]);
    const reconstructedKey = crypto.createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });

    const signatureBuffer = this.fromBase64Url(signature);
    return crypto.verify(null, Buffer.from(message), reconstructedKey, signatureBuffer);
  }

  async resolveIdentity(id: string): Promise<AgentIdentity | null> {
    return this.identities.get(id) ?? null;
  }

  private toBase58(buffer: Buffer): string {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let num = BigInt('0x' + buffer.toString('hex'));
    let result = '';
    while (num > 0n) {
      const remainder = Number(num % 58n);
      num = num / 58n;
      result = alphabet[remainder] + result;
    }
    // Preserve leading zeros
    for (const byte of buffer) {
      if (byte === 0) {
        result = '1' + result;
      } else {
        break;
      }
    }
    return result || '1';
  }

  private fromBase58(str: string): Buffer {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let num = 0n;
    for (const char of str) {
      const index = alphabet.indexOf(char);
      if (index === -1) {
        throw new Error(`Invalid base58 character: ${char}`);
      }
      num = num * 58n + BigInt(index);
    }
    const hex = num.toString(16).padStart(2, '0');
    const paddedHex = hex.length % 2 ? '0' + hex : hex;
    const bytes = Buffer.from(paddedHex, 'hex');

    // Count leading '1's (which represent leading zero bytes in base58)
    let leadingZeros = 0;
    for (const char of str) {
      if (char === '1') {
        leadingZeros++;
      } else {
        break;
      }
    }

    if (leadingZeros > 0) {
      return Buffer.concat([Buffer.alloc(leadingZeros), bytes]);
    }
    return bytes;
  }

  private toBase64Url(buffer: Buffer): string {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private fromBase64Url(str: string): Buffer {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    return Buffer.from(base64, 'base64');
  }
}
