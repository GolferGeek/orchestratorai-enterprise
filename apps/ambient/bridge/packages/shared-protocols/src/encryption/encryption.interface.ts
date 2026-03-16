export interface IEncryptionProvider {
  readonly providerId: string;

  encrypt(message: string, recipientPublicKey: string): Promise<string>;
  decrypt(ciphertext: string, privateKey: string): Promise<string>;
  establishSharedSecret(peerPublicKey: string): Promise<string>;
  rotateKeys(): Promise<{ publicKey: string; privateKey: string }>;
}
