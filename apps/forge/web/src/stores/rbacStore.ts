/**
 * RBAC Store
 * Unified authentication and authorization store
 * Manages: login/logout, user profile, roles, permissions, organization context
 */
import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { authService } from '@/services/authService';
import { apiService } from '@/services/apiService';
import { getAuthProvider } from '@/services/auth';
import { tokenManager } from '@/services/tokenManager';
import { tokenStorage } from '@/services/tokenStorageService';
import rbacService, {
  type RbacRole,
  type RbacPermission,
  type UserRole,
  type UserOrganization,
  type OrganizationUser,
} from '@/services/rbacService';
import type { SignupData } from '@/types/auth';

// User profile from /auth/me
interface UserProfile {
  id: string;
  email?: string;
  displayName?: string;
  roles: string[];
  organizationAccess?: string[];
}

// Token data from login/signup
interface TokenData {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresIn?: number;
}

const resolveErrorMessage = (error: unknown, fallback: string): string => (
  error instanceof Error && error.message ? error.message : fallback
);

// ==================== SHARED AUTH COOKIE (Cross-App SSO) ====================
const SHARED_COOKIE_NAME = 'orch_auth_token';

function getSharedCookieDomain(): string {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return hostname;
  return '.orchestratorai.io';
}

function setSharedAuthCookie(tokenValue: string): void {
  const domain = getSharedCookieDomain();
  const secure = window.location.protocol === 'https:';
  document.cookie = `${SHARED_COOKIE_NAME}=${encodeURIComponent(tokenValue)}; domain=${domain}; path=/; max-age=28800; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function getSharedAuthCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${SHARED_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function clearSharedAuthCookie(): void {
  const domain = getSharedCookieDomain();
  document.cookie = `${SHARED_COOKIE_NAME}=; domain=${domain}; path=/; max-age=0`;
}

const getResponseStatus = (error: unknown): number | undefined => {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { status?: number } }).response;
    if (response && typeof response.status === 'number') {
      return response.status;
    }
  }
  return undefined;
};

export const useRbacStore = defineStore('rbac', () => {
  // ==================== AUTH STATE ====================
  // Tokens are persisted in localStorage for login across browser sessions
  const token = ref<string | null>(localStorage.getItem('authToken'));
  const refreshToken = ref<string | null>(localStorage.getItem('refreshToken'));
  const user = ref<UserProfile | null>(null);
  const authLoading = ref(false);
  const authError = ref<string | null>(null);

  // Auth computed
  const isAuthenticated = computed(() => !!token.value);

  // Session management
  const sessionStartTime = ref<Date | null>(null);
  const lastActivityTime = ref<Date | null>(null);
  const sessionTimeoutMinutes = ref(480); // 8 hours

  const isSessionActive = computed(() => {
    if (!sessionStartTime.value || !lastActivityTime.value) return false;
    const now = new Date();
    const timeSinceLastActivity = now.getTime() - lastActivityTime.value.getTime();
    return timeSinceLastActivity < (sessionTimeoutMinutes.value * 60 * 1000);
  });

  const updateActivity = () => {
    lastActivityTime.value = new Date();
  };

  watch(isAuthenticated, (newVal) => {
    if (newVal && !sessionStartTime.value) {
      sessionStartTime.value = new Date();
      lastActivityTime.value = new Date();
    } else if (!newVal) {
      sessionStartTime.value = null;
      lastActivityTime.value = null;
    }
  });

  // ==================== RBAC STATE ====================
  // Load persisted organization from localStorage
  const currentOrganization = ref<string | null>(localStorage.getItem('currentOrganization'));
  const userRoles = ref<Map<string, UserRole[]>>(new Map());
  const userPermissions = ref<Map<string, string[]>>(new Map());
  const userOrganizations = ref<UserOrganization[]>([]);
  const organizationUsers = ref<Map<string, OrganizationUser[]>>(new Map());
  const isSuperAdmin = ref(false);
  const allRoles = ref<RbacRole[]>([]);
  const allPermissions = ref<RbacPermission[]>([]);
  const permissionsByCategory = ref<Record<string, RbacPermission[]>>({});
  const rbacLoading = ref(false);
  const isInitialized = ref(false);
  let initializationPromise: Promise<void> | null = null;

  // RBAC computed
  const isAdmin = computed(() => isSuperAdmin.value || (user.value?.roles?.includes('admin') ?? false));
  const hasAdminAccess = computed(() => isAdmin.value);
  const hasEvaluationAccess = computed(() => isSuperAdmin.value || isAdmin.value || (user.value?.roles?.includes('manager') ?? false));

  const currentOrgRoles = computed(() => {
    if (!currentOrganization.value) return [];
    return userRoles.value.get(currentOrganization.value) || [];
  });

  const currentOrgPermissions = computed(() => {
    if (!currentOrganization.value) return [];
    return userPermissions.value.get(currentOrganization.value) || [];
  });

  const currentOrgUsers = computed(() => {
    if (!currentOrganization.value) return [];
    return organizationUsers.value.get(currentOrganization.value) || [];
  });

  const hasAnyOrganization = computed(() => userOrganizations.value.length > 0);

  // ==================== AUTH ACTIONS ====================

  function setTokenData(tokenData: TokenData) {
    // IMPORTANT: Set token on apiService and storage BEFORE setting reactive
    // token.value. Setting token.value triggers Vue reactivity synchronously,
    // which can cause watchers (e.g. AgentTreeView) to fire API calls.
    // Those calls need the token already on apiService to avoid 401s.
    localStorage.setItem('authToken', tokenData.accessToken);
    tokenStorage.setAccessToken(tokenData.accessToken);
    apiService.setAuthToken(tokenData.accessToken);
    setSharedAuthCookie(tokenData.accessToken);
    if (tokenData.refreshToken) {
      localStorage.setItem('refreshToken', tokenData.refreshToken);
      tokenStorage.setRefreshToken(tokenData.refreshToken);
    }
    authError.value = null;
    // Set reactive refs LAST — these trigger watchers that may call APIs
    token.value = tokenData.accessToken;
    if (tokenData.refreshToken) {
      refreshToken.value = tokenData.refreshToken;
    }
  }

  function clearAuthData() {
    token.value = null;
    refreshToken.value = null;
    user.value = null;
    // Clear from localStorage (explicit logout)
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userData');
    // Clear shared cookie for cross-app SSO
    clearSharedAuthCookie();
    apiService.clearAuth();
    reset();
  }

  async function login(credentials: { email: string; password: string }) {
    authLoading.value = true;
    authError.value = null;
    try {
      const tokenData = await authService.login(credentials);
      setTokenData(tokenData);
      await fetchCurrentUser();
      await initialize();
      tokenManager.startMonitoring();
      authLoading.value = false;
      return true;
    } catch (err) {
      authError.value = resolveErrorMessage(err, 'Login failed.');
      clearAuthData();
      authLoading.value = false;
      return false;
    }
  }

  async function signupAndLogin(signupData: SignupData) {
    authLoading.value = true;
    authError.value = null;
    try {
      const tokenData = await authService.signup(signupData);
      setTokenData(tokenData);
      await fetchCurrentUser();
      await initialize();
      tokenManager.startMonitoring();
      authLoading.value = false;
      return { success: true };
    } catch (err) {
      const message = resolveErrorMessage(err, 'Signup failed.');
      authError.value = message;
      if (message.includes('confirm your account')) {
        authLoading.value = false;
        return { success: false, emailConfirmationPending: true, message };
      }
      clearAuthData();
      authLoading.value = false;
      return { success: false, message };
    }
  }

  async function loginOidc() {
    authLoading.value = true;
    authError.value = null;
    try {
      const authProvider = getAuthProvider();
      await authProvider.initiateLogin();
      // Browser will redirect away — loading stays true intentionally.
    } catch (err) {
      authError.value = resolveErrorMessage(err, 'OIDC login failed.');
      authLoading.value = false;
    }
  }

  async function handleOidcCallback(): Promise<boolean> {
    authLoading.value = true;
    authError.value = null;
    try {
      const authProvider = getAuthProvider();
      const tokenData = await authProvider.handleCallback();
      if (!tokenData) {
        // No redirect response — normal page load, not a callback.
        authLoading.value = false;
        return false;
      }
      setTokenData(tokenData);
      await fetchCurrentUser();
      await initialize();
      tokenManager.startMonitoring();
      authLoading.value = false;
      return true;
    } catch (err) {
      authError.value = resolveErrorMessage(err, 'OIDC callback failed.');
      clearAuthData();
      authLoading.value = false;
      return false;
    }
  }

  async function logout() {
    try {
      const authProvider = getAuthProvider();
      await authProvider.logout();
    } catch {
      // Logout errors are non-critical - continue with local cleanup
    }
    tokenManager.stopMonitoring();
    clearAuthData();
  }

  async function refreshAuthToken(): Promise<boolean> {
    try {
      authLoading.value = true;
      authError.value = null;
      const authProvider = getAuthProvider();
      const tokenData = await authProvider.refreshToken();
      setTokenData(tokenData);
      await fetchCurrentUser();
      return true;
    } catch {
      authError.value = 'Could not refresh authentication token.';
      clearAuthData();
      return false;
    } finally {
      authLoading.value = false;
    }
  }

  async function fetchCurrentUser() {
    if (!token.value) {
      console.log('[SSO] fetchCurrentUser: no token, skipping');
      user.value = null;
      localStorage.removeItem('userData');
      return;
    }
    try {
      console.log('[SSO] fetchCurrentUser: calling /auth/me...');
      const userData = await apiService.getCurrentUser() as UserProfile;
      user.value = userData;
      localStorage.setItem('userData', JSON.stringify(userData));
      authError.value = null;
      console.log('[SSO] fetchCurrentUser: SUCCESS, user:', userData.email);
    } catch (err) {
      console.error('[SSO] fetchCurrentUser: FAILED', err, 'status:', getResponseStatus(err));
      authError.value = 'Could not fetch user details.';
      if (getResponseStatus(err) === 401) {
        console.error('[SSO] fetchCurrentUser: 401 - clearing auth data');
        clearAuthData();
      }
    }
  }

  // ==================== RBAC ACTIONS ====================

  async function initialize(): Promise<void> {
    if (isInitialized.value) return;
    if (!token.value) return;

    // Deduplicate: if already initializing, wait on the same promise
    if (initializationPromise) return initializationPromise;

    initializationPromise = (async () => {
      rbacLoading.value = true;
      try {
        // Ensure user profile is loaded before RBAC init
        if (!user.value) {
          await fetchCurrentUser();
        }

        // If auth was invalidated during fetchCurrentUser (expired token, failed refresh), bail out
        if (!token.value) return;

        const orgs = await rbacService.getMyOrganizations();
        userOrganizations.value = orgs;
        isSuperAdmin.value = await rbacService.checkSuperAdmin();

        if (orgs.length > 0) {
          // Check if persisted org is still valid (user has access to it)
          // Allow '*' (all orgs) as a valid persisted value
          const persistedOrg = currentOrganization.value;
          const persistedOrgValid = persistedOrg &&
            (persistedOrg === '*' || orgs.some((o) => o.organizationSlug === persistedOrg));

          if (persistedOrgValid) {
            // Load permissions for the persisted org
            await setOrganization(persistedOrg);
          } else {
            // Default to '*' (all orgs) when no valid persisted org
            await setOrganization('*');
          }
        }

        await loadRolesAndPermissions();
        isInitialized.value = true;
      } catch (error) {
        console.error('Failed to initialize RBAC:', error);
      } finally {
        rbacLoading.value = false;
        initializationPromise = null;
      }
    })();

    return initializationPromise;
  }

  async function setOrganization(orgSlug: string): Promise<void> {
    currentOrganization.value = orgSlug;
    // Persist to localStorage so it survives page reloads
    localStorage.setItem('currentOrganization', orgSlug);
    // Load user permissions first (required for all users)
    await loadUserPermissions(orgSlug);
    // Only load organization users if user has admin:users permission (or is super-admin)
    // This endpoint requires admin:users permission, skip for non-admin users to avoid 403 errors
    const canViewUsers = isSuperAdmin.value || hasPermission('admin:users');
    if (canViewUsers) {
      await loadOrganizationUsers(orgSlug);
    }
  }

  async function loadUserPermissions(orgSlug: string): Promise<void> {
    try {
      const [roles, permissions] = await Promise.all([
        rbacService.getMyRoles(orgSlug),
        rbacService.getMyPermissions(orgSlug),
      ]);
      userRoles.value.set(orgSlug, roles);
      userPermissions.value.set(orgSlug, permissions.map((p) => p.permission));
    } catch (error) {
      console.error(`Failed to load permissions for org ${orgSlug}:`, error);
      userRoles.value.set(orgSlug, []);
      userPermissions.value.set(orgSlug, []);
    }
  }

  async function loadOrganizationUsers(orgSlug: string): Promise<void> {
    try {
      const users = await rbacService.getOrganizationUsers(orgSlug);
      organizationUsers.value.set(orgSlug, users);
    } catch (error) {
      console.error(`Failed to load users for org ${orgSlug}:`, error);
      organizationUsers.value.set(orgSlug, []);
    }
  }

  async function loadRolesAndPermissions(): Promise<void> {
    try {
      const [roles, permData] = await Promise.all([
        rbacService.getAllRoles(),
        rbacService.getAllPermissions(),
      ]);
      allRoles.value = roles;
      allPermissions.value = permData.permissions;
      permissionsByCategory.value = permData.grouped;
    } catch (error) {
      console.error('Failed to load roles and permissions:', error);
    }
  }

  function hasPermission(permission: string): boolean {
    if (isSuperAdmin.value) return true;
    if (!currentOrganization.value) return false;

    const perms = userPermissions.value.get(currentOrganization.value) || [];
    if (perms.includes(permission)) return true;

    const category = permission.split(':')[0];
    if (perms.includes(`${category}:*`)) return true;
    if (perms.includes('*:*')) return true;

    return false;
  }

  function hasAnyPermission(permissions: string[]): boolean {
    return permissions.some((p) => hasPermission(p));
  }

  function hasAllPermissions(permissions: string[]): boolean {
    return permissions.every((p) => hasPermission(p));
  }

  function hasRole(roleName: string): boolean {
    if (isSuperAdmin.value) return true;
    if (!currentOrganization.value) return false;
    const roles = userRoles.value.get(currentOrganization.value) || [];
    return roles.some((r) => r.name === roleName);
  }

  function hasPermissionInOrg(orgSlug: string, permission: string): boolean {
    if (isSuperAdmin.value) return true;
    const perms = userPermissions.value.get(orgSlug) || [];
    if (perms.includes(permission)) return true;
    const category = permission.split(':')[0];
    if (perms.includes(`${category}:*`)) return true;
    if (perms.includes('*:*')) return true;
    return false;
  }

  function reset(): void {
    currentOrganization.value = null;
    localStorage.removeItem('currentOrganization');
    userRoles.value.clear();
    userPermissions.value.clear();
    userOrganizations.value = [];
    isSuperAdmin.value = false;
    isInitialized.value = false;
  }

  async function refresh(): Promise<void> {
    if (currentOrganization.value) {
      await loadUserPermissions(currentOrganization.value);
    }
  }

  // Initialize on store creation if token exists (from localStorage, URL param, or shared cookie)
  console.log('[SSO] rbacStore init - localStorage token:', !!token.value);
  if (!token.value) {
    // Check URL params for SSO token (dev mode cross-port SSO)
    const urlParams = new URLSearchParams(window.location.search);
    const ssoToken = urlParams.get('sso_token');
    if (ssoToken) {
      token.value = ssoToken;
      localStorage.setItem('authToken', ssoToken);
      // Also update in-memory token storage so apiService can read it
      tokenStorage.setAccessToken(ssoToken);
      // Clean the URL to remove the token
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
      console.log('[SSO] Set token from URL sso_token param');
    }
  }
  if (!token.value) {
    // No localStorage token - check shared cookie for cross-app SSO
    const cookieToken = getSharedAuthCookie();
    console.log('[SSO] No localStorage token, cookie check:', !!cookieToken, cookieToken ? `(${cookieToken.length} chars)` : '');
    if (cookieToken) {
      token.value = cookieToken;
      localStorage.setItem('authToken', cookieToken);
      tokenStorage.setAccessToken(cookieToken);
      console.log('[SSO] Set token from cookie');
    }
  }

  if (token.value) {
    // Ensure shared cookie is set for cross-app SSO (covers existing sessions)
    setSharedAuthCookie(token.value);
    authService.initializeAuthHeader();
    apiService.setAuthToken(token.value);
    tokenManager.startMonitoring();
    // Defer initialize() to avoid TDZ issues in legacy/SystemJS bundles.
    // The router guard also calls initialize() before any authenticated route,
    // so this is a best-effort pre-warm, not a requirement.
    console.log('[SSO] Starting RBAC initialization with token');
    queueMicrotask(() => {
      initialize().then(() => {
        console.log('[SSO] RBAC initialize complete, isAuthenticated:', !!token.value, 'user:', !!user.value);
      }).catch((err) => {
        console.error('[SSO] RBAC initialize FAILED:', err);
      });
    });
  } else {
    console.log('[SSO] No token found (no localStorage, no cookie)');
  }

  return {
    // Auth state
    token,
    refreshToken,
    user,
    isLoading: authLoading,
    error: authError,
    isAuthenticated,
    isSessionActive,
    sessionStartTime: computed(() => sessionStartTime.value),
    lastActivityTime: computed(() => lastActivityTime.value),

    // Role checks
    isSuperAdmin,
    isAdmin,
    hasAdminAccess,
    hasEvaluationAccess,

    // RBAC state
    currentOrganization,
    userRoles,
    userPermissions,
    userOrganizations,
    organizationUsers,
    allRoles,
    allPermissions,
    permissionsByCategory,
    isInitialized,

    // RBAC computed
    currentOrgRoles,
    currentOrgPermissions,
    currentOrgUsers,
    hasAnyOrganization,

    // Auth actions
    login,
    loginOidc,
    handleOidcCallback,
    signupAndLogin,
    logout,
    fetchCurrentUser,
    refreshAuthToken,
    updateActivity,
    clearAuthData,

    // RBAC actions
    initialize,
    setOrganization,
    loadUserPermissions,
    loadOrganizationUsers,
    loadRolesAndPermissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole,
    hasPermissionInOrg,
    reset,
    clear: reset,
    refresh,
  };
});

// Export for backwards compatibility - alias as authStore
export const useAuthStore = useRbacStore;
