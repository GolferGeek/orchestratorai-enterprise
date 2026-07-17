import type { AuthResponse } from '@/services/authService';

export interface AuthProvider {
  readonly isOidcProvider: boolean;

  /** Email/password login (credential-based providers). Throws for OIDC providers. */
  login(credentials: { email: string; password: string }): Promise<AuthResponse>;

  /** Email/password signup (credential-based providers). Throws for OIDC providers. */
  signup(data: { email: string; password: string; displayName?: string }): Promise<AuthResponse>;

  /** Initiate OIDC redirect (Azure/Auth0). Throws for credential providers. */
  initiateLogin(): Promise<void>;

  /** Process OIDC redirect response. Returns null for non-OIDC providers. */
  handleCallback(): Promise<AuthResponse | null>;

  /** Sign out and clear provider-specific state. */
  logout(): Promise<void>;

  /** Refresh the access token. */
  refreshToken(): Promise<AuthResponse>;

  /** Get the current access token (or null if not authenticated). */
  getToken(): Promise<string | null>;
}
