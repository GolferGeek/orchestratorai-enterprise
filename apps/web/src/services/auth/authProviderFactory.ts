import type { AuthProvider } from './authProvider.interface';
import { SupabaseAuthProvider } from './supabaseAuthProvider';
import { AzureOidcAuthProvider } from './azureOidcAuthProvider';
import { Auth0AuthProvider } from './auth0AuthProvider';
import { GoogleOidcAuthProvider } from './googleOidcAuthProvider';

let instance: AuthProvider | null = null;

export function getAuthProvider(): AuthProvider {
  if (instance) return instance;

  const provider = import.meta.env.VITE_AUTH_PROVIDER;
  if (!provider) {
    throw new Error(
      'VITE_AUTH_PROVIDER is required. Set it to one of: supabase, azure_oidc, auth0, google_oidc',
    );
  }

  switch (provider) {
    case 'supabase':
      instance = new SupabaseAuthProvider();
      break;
    case 'azure_oidc':
      instance = new AzureOidcAuthProvider();
      break;
    case 'auth0':
      instance = new Auth0AuthProvider();
      break;
    case 'google_oidc':
      instance = new GoogleOidcAuthProvider();
      break;
    default:
      throw new Error(`Unknown auth provider: ${provider}`);
  }

  return instance;
}
