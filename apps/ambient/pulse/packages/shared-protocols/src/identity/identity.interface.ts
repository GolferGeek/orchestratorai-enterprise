export interface AgentIdentity {
  id: string;
  publicKey: string;
  algorithm: string;
  createdAt: string;
}

export interface IIdentityProvider {
  readonly providerId: string;

  generateIdentity(): Promise<AgentIdentity>;
  sign(message: string): Promise<string>;
  verify(message: string, signature: string, publicKey: string): Promise<boolean>;
  resolveIdentity(id: string): Promise<AgentIdentity | null>;
}
