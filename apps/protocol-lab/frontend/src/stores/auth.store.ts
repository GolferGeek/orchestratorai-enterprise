import { defineStore } from 'pinia';
import { ref } from 'vue';

interface LoginResponse {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  expiresIn?: number;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64));
}

// Platform-wide localStorage key (shared with all OrchestratorAI products)
const PLATFORM_TOKEN_KEY = 'authToken';

function hydrateUserFromToken(token: string): { email: string; name: string } {
  try {
    const payload = decodeJwtPayload(token);
    const metadata = (payload.user_metadata || {}) as Record<string, string>;
    const email = (payload.email as string) || '';
    return {
      email,
      name: metadata.display_name || email.split('@')[0] || 'User',
    };
  } catch {
    return { email: '', name: 'User' };
  }
}

export const useAuthStore = defineStore('auth', () => {
  const isAuthenticated = ref(false);
  const user = ref({ email: '', name: '' });
  const accessToken = ref('');

  // SSO: check URL hash for sso_token first (cross-app navigation)
  // Hash fragments are never sent to servers/proxies
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const ssoToken = hashParams.get('sso_token');
  if (ssoToken) {
    accessToken.value = ssoToken;
    user.value = hydrateUserFromToken(ssoToken);
    isAuthenticated.value = true;
    localStorage.setItem(PLATFORM_TOKEN_KEY, ssoToken);
    // Clean the URL to remove the token
    window.history.replaceState({}, '', window.location.pathname);
  } else {
    // Restore session from platform-wide localStorage
    const savedToken = localStorage.getItem(PLATFORM_TOKEN_KEY);
    if (savedToken) {
      accessToken.value = savedToken;
      user.value = hydrateUserFromToken(savedToken);
      isAuthenticated.value = true;
    }
  }

  async function login(email: string, password: string): Promise<void> {
    const response = await fetch('/main-api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Login failed: ${errorBody}`);
    }

    const data: LoginResponse = await response.json();

    accessToken.value = data.accessToken;

    // Decode user info from JWT payload
    const payload = decodeJwtPayload(data.accessToken);
    const metadata = (payload.user_metadata || {}) as Record<string, string>;
    user.value = {
      email: (payload.email as string) || email,
      name: metadata.display_name || email.split('@')[0],
    };
    isAuthenticated.value = true;

    // Persist to platform-wide localStorage (shared with other OrchestratorAI apps)
    localStorage.setItem(PLATFORM_TOKEN_KEY, data.accessToken);
  }

  function logout(): void {
    isAuthenticated.value = false;
    user.value = { email: '', name: '' };
    accessToken.value = '';
    localStorage.removeItem(PLATFORM_TOKEN_KEY);
  }

  function getAuthHeaders(): Record<string, string> {
    if (accessToken.value) {
      return { Authorization: `Bearer ${accessToken.value}` };
    }
    return {};
  }

  return { isAuthenticated, user, accessToken, login, logout, getAuthHeaders };
});
