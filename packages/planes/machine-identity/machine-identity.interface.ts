export const MACHINE_IDENTITY_PROVIDER = Symbol('MACHINE_IDENTITY_PROVIDER');

export interface MachineIdentityProvider {
  getIdentityString(): Promise<string>; // e.g. "tailscale:ndk7XVQxGN11CNTRL"
  getNodeId(): Promise<string>;
  getHostName(): Promise<string>;
}
