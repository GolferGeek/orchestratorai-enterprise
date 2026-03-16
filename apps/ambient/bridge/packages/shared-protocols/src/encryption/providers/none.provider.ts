import { IEncryptionProvider } from '../encryption.interface';

export class NoneEncryptionProvider implements IEncryptionProvider {
  readonly providerId = 'none';

  async encrypt(message: string): Promise<string> {
    return message; // Plaintext — no encryption
  }

  async decrypt(ciphertext: string): Promise<string> {
    return ciphertext; // Plaintext — no decryption
  }

  async establishSharedSecret(): Promise<string> {
    return 'none'; // No shared secret needed
  }

  async rotateKeys(): Promise<{ publicKey: string; privateKey: string }> {
    return { publicKey: 'none', privateKey: 'none' };
  }
}
