import type { AuthProvider } from './authProvider.interface';
import type { AuthResponse } from '@/services/authService';

const NOT_CONFIGURED = 'Auth0 is not configured. Set up an Auth0 provider to use this flow.';

export class Auth0AuthProvider implements AuthProvider {
  readonly isOidcProvider = true;

  async login(_credentials: { email: string; password: string }): Promise<AuthResponse> {
    throw new Error(NOT_CONFIGURED);
  }

  async signup(_data: { email: string; password: string; displayName?: string }): Promise<AuthResponse> {
    throw new Error(NOT_CONFIGURED);
  }

  async initiateLogin(): Promise<void> {
    throw new Error(NOT_CONFIGURED);
  }

  async handleCallback(): Promise<AuthResponse | null> {
    throw new Error(NOT_CONFIGURED);
  }

  async logout(): Promise<void> {
    throw new Error(NOT_CONFIGURED);
  }

  async refreshToken(): Promise<AuthResponse> {
    throw new Error(NOT_CONFIGURED);
  }

  async getToken(): Promise<string | null> {
    throw new Error(NOT_CONFIGURED);
  }
}
