import type { AuthProvider } from './authProvider.interface';
import type { AuthResponse } from '@/services/authService';
import { authService } from '@/services/authService';

export class SupabaseAuthProvider implements AuthProvider {
  readonly isOidcProvider = false;

  async login(credentials: { email: string; password: string }): Promise<AuthResponse> {
    return authService.login(credentials);
  }

  async signup(data: { email: string; password: string; displayName?: string }): Promise<AuthResponse> {
    return authService.signup(data);
  }

  async initiateLogin(): Promise<void> {
    throw new Error('Supabase does not use OIDC redirect login.');
  }

  async handleCallback(): Promise<AuthResponse | null> {
    // No redirect to process for credential-based login.
    return null;
  }

  async logout(): Promise<void> {
    return authService.logout();
  }

  async refreshToken(): Promise<AuthResponse> {
    return authService.refreshToken();
  }

  async getToken(): Promise<string | null> {
    return authService.getToken();
  }
}
