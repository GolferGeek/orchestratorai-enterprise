import {
  PublicClientApplication,
  type Configuration,
  type AuthenticationResult,
} from '@azure/msal-browser';
import type { AuthProvider } from './authProvider.interface';
import type { AuthResponse } from '@/services/authService';

function getMsalConfig(): Configuration {
  const clientId = import.meta.env.VITE_AZURE_CLIENT_ID;
  const tenantId = import.meta.env.VITE_AZURE_TENANT_ID;
  const redirectUri = import.meta.env.VITE_AZURE_REDIRECT_URI;

  if (!clientId || !tenantId || !redirectUri) {
    throw new Error(
      'Azure OIDC requires VITE_AZURE_CLIENT_ID, VITE_AZURE_TENANT_ID, and VITE_AZURE_REDIRECT_URI.',
    );
  }

  return {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri,
    },
    cache: {
      cacheLocation: 'localStorage',
    },
  };
}

const LOGIN_SCOPES = ['openid', 'profile', 'email'];

let msalInstance: PublicClientApplication | null = null;
let msalInitPromise: Promise<void> | null = null;

async function ensureMsalInitialized(): Promise<PublicClientApplication> {
  if (!msalInstance) {
    msalInstance = new PublicClientApplication(getMsalConfig());
    msalInitPromise = msalInstance.initialize();
  }
  await msalInitPromise;
  return msalInstance;
}

function toAuthResponse(result: AuthenticationResult): AuthResponse {
  return {
    accessToken: result.idToken, // Use idToken as JWT for our API
    tokenType: 'Bearer',
    expiresIn: result.expiresOn
      ? Math.floor((result.expiresOn.getTime() - Date.now()) / 1000)
      : undefined,
  };
}

export class AzureOidcAuthProvider implements AuthProvider {
  readonly isOidcProvider = true;

  async login(_credentials: { email: string; password: string }): Promise<AuthResponse> {
    throw new Error('Azure OIDC uses redirect login. Call initiateLogin() instead.');
  }

  async signup(_data: { email: string; password: string; displayName?: string }): Promise<AuthResponse> {
    throw new Error('Azure OIDC does not support signup. Users are provisioned in Entra ID.');
  }

  async initiateLogin(): Promise<void> {
    const msal = await ensureMsalInitialized();
    await msal.loginRedirect({ scopes: LOGIN_SCOPES });
  }

  async handleCallback(): Promise<AuthResponse | null> {
    const msal = await ensureMsalInitialized();
    const result = await msal.handleRedirectPromise();
    if (!result) {
      return null;
    }
    return toAuthResponse(result);
  }

  async logout(): Promise<void> {
    const msal = await ensureMsalInitialized();
    await msal.logoutRedirect();
  }

  async refreshToken(): Promise<AuthResponse> {
    const msal = await ensureMsalInitialized();
    const accounts = msal.getAllAccounts();
    if (accounts.length === 0) {
      throw new Error('No Azure account found. User must log in again.');
    }
    const result = await msal.acquireTokenSilent({
      scopes: LOGIN_SCOPES,
      account: accounts[0],
    });
    return toAuthResponse(result);
  }

  async getToken(): Promise<string | null> {
    const msal = await ensureMsalInitialized();
    const accounts = msal.getAllAccounts();
    if (accounts.length === 0) {
      return null;
    }
    const result = await msal.acquireTokenSilent({
      scopes: LOGIN_SCOPES,
      account: accounts[0],
    });
    return result.idToken;
  }
}
