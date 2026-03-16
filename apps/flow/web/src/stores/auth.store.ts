/**
 * Auth Store
 *
 * Manages auth state. Token is read from localStorage under the shared
 * 'authToken' key — the same key Command and Compose write after login.
 * This enables SSO: user logs in to Command, Flow picks up the token.
 *
 * Secondary SSO path: shared cookie 'orch_auth_token' is checked if
 * localStorage does not have the token.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { flowApiService } from '@/services/flow-api.service';
import type { UserContext } from '@/types/flow';

// ─── Shared SSO token constants ───────────────────────────────────────────────

const SHARED_TOKEN_KEY = 'authToken';
const SHARED_COOKIE_NAME = 'orch_auth_token';

function getSharedAuthCookie(): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${SHARED_COOKIE_NAME}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function readSharedToken(): string | null {
  const fromStorage = localStorage.getItem(SHARED_TOKEN_KEY);
  if (fromStorage) return fromStorage;
  // Cookie fallback for cross-port SSO on localhost
  const fromCookie = getSharedAuthCookie();
  if (fromCookie) {
    // Persist into localStorage so subsequent reads are synchronous
    localStorage.setItem(SHARED_TOKEN_KEY, fromCookie);
    return fromCookie;
  }
  return null;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = defineStore('auth', () => {
  const userContext = ref<UserContext | null>(null);
  const loading = ref(false);
  const initialized = ref(false);

  const user = computed(() => userContext.value?.user ?? null);
  const teams = computed(() => userContext.value?.teams ?? []);
  const organizations = computed(() => userContext.value?.organizations ?? []);

  const isAuthenticated = computed(() => !!readSharedToken());

  async function loadUserContext() {
    if (!isAuthenticated.value) return;
    loading.value = true;
    try {
      userContext.value = await flowApiService.getUserContext();
    } finally {
      loading.value = false;
      initialized.value = true;
    }
  }

  function signOut() {
    localStorage.removeItem(SHARED_TOKEN_KEY);
    localStorage.removeItem('refreshToken');
    // Clear shared cookie
    const domain =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
        ? window.location.hostname
        : '.orchestratorai.io';
    document.cookie = `${SHARED_COOKIE_NAME}=; domain=${domain}; path=/; max-age=0`;
    userContext.value = null;
    initialized.value = false;
  }

  /**
   * Explicitly set a token (e.g. after local login or token hand-off).
   * Persists under the shared key so Command and other products can read it.
   */
  function setToken(token: string, userId: string, email: string, displayName?: string) {
    localStorage.setItem(SHARED_TOKEN_KEY, token);
    // Also keep user metadata accessible for components that need it inline.
    const userData = { id: userId, email, displayName };
    localStorage.setItem('userData', JSON.stringify(userData));
  }

  return {
    userContext,
    loading,
    initialized,
    user,
    teams,
    organizations,
    isAuthenticated,
    loadUserContext,
    signOut,
    setToken,
  };
});
