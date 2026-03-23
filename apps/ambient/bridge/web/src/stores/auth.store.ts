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

export const useAuthStore = defineStore('auth', () => {
  const isAuthenticated = ref(false);
  const user = ref({ email: '', name: '' });
  const accessToken = ref('');

  // Restore session from localStorage on init
  const savedToken = localStorage.getItem('agent-comm-jwt');
  const savedUser = localStorage.getItem('agent-comm-user');
  if (savedToken && savedUser) {
    accessToken.value = savedToken;
    user.value = JSON.parse(savedUser);
    isAuthenticated.value = true;
  }

  async function login(email: string, password: string): Promise<void> {
    const response = await fetch('/auth/login', {
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

    // Persist session
    localStorage.setItem('agent-comm-jwt', data.accessToken);
    localStorage.setItem('agent-comm-user', JSON.stringify(user.value));
  }

  function logout(): void {
    isAuthenticated.value = false;
    user.value = { email: '', name: '' };
    accessToken.value = '';
    localStorage.removeItem('agent-comm-jwt');
    localStorage.removeItem('agent-comm-user');
  }

  function getAuthHeaders(): Record<string, string> {
    if (accessToken.value) {
      return { Authorization: `Bearer ${accessToken.value}` };
    }
    return {};
  }

  return { isAuthenticated, user, accessToken, login, logout, getAuthHeaders };
});
