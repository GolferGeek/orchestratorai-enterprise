/**
 * Auth API Service
 * HTTP client for ALL Auth API calls (port 6100).
 * Admin Web NEVER talks to the database directly — all operations go through Auth API.
 *
 * Architecture: Admin Web -> auth-api.service.ts (HTTP) -> Auth API (port 6100) -> Supabase
 */
import axios, { AxiosInstance, AxiosError } from 'axios';
import { tokenStorage } from './tokenStorageService';

// ===================== Types =====================

export interface Organization {
  slug: string;
  name: string;
  description?: string;
  url?: string;
  settings?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateOrgRequest {
  slug: string;
  name: string;
  description?: string;
  url?: string;
}

export interface UpdateOrgRequest {
  name?: string;
  description?: string;
  url?: string;
}

export interface AdminUser {
  id: string;
  email: string;
  displayName?: string;
  roles: Array<{ name: string; displayName: string; isGlobal?: boolean }>;
  status: string;
  createdAt: string;
}

export interface InviteUserRequest {
  email: string;
  displayName?: string;
  roles?: string[];
  organizationSlug?: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  displayName?: string;
  roles?: string[];
  emailConfirm?: boolean;
  organizationAccess?: string[];
}

export interface UpdateUserRequest {
  displayName?: string;
  roles?: string[];
}

export interface AdminRole {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  isSystem: boolean;
  permissions?: Array<{ name: string; displayName: string }>;
}

export interface CreateRoleRequest {
  name: string;
  displayName: string;
  description?: string;
  permissions?: string[];
}

export interface Entitlement {
  id: string;
  orgSlug: string;
  product: string;
  grantedAt: string;
  grantedBy?: string;
}

export interface GrantEntitlementRequest {
  product: string;
}

export interface SystemConfig {
  key: string;
  value: unknown;
  description?: string;
  updatedAt: string;
}

// ===================== Auth API Client =====================

class AuthApiService {
  private client: AxiosInstance;

  constructor() {
    // In dev: Vite proxy routes to Auth API on port 6100
    // In gateway: VITE_API_BASE_URL points to the auth API via gateway
    this.client = axios.create({
      baseURL: import.meta.env.VITE_API_BASE_URL || '/',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Attach auth token to every request.
    // Uses synchronous getAccessTokenSync() because Axios request interceptors
    // must be synchronous. tokenStorage.initialize() has already run by the time
    // any request is made (tokenStorageService is initialized at app startup via
    // tokenStorage.setAccessToken / rbacStore init).
    this.client.interceptors.request.use((config) => {
      const token = tokenStorage.getAccessTokenSync();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      // Admin operations always use global org context
      config.headers['x-organization-slug'] = '*';
      return config;
    });

    // Handle 401 — dispatch session-expired event for App.vue to catch
    this.client.interceptors.response.use(
      (res) => res,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          window.dispatchEvent(new Event('auth:session-expired'));
        }
        return Promise.reject(error);
      },
    );
  }

  // ===================== Organizations =====================

  async listOrgs(): Promise<Organization[]> {
    const res = await this.client.get<Organization[]>('/admin/organizations');
    return res.data;
  }

  async createOrg(request: CreateOrgRequest): Promise<Organization> {
    const res = await this.client.post<Organization>('/admin/organizations', request);
    return res.data;
  }

  async updateOrg(slug: string, request: UpdateOrgRequest): Promise<Organization> {
    const res = await this.client.put<Organization>(`/admin/organizations/${slug}`, request);
    return res.data;
  }

  async deleteOrg(slug: string): Promise<void> {
    await this.client.delete(`/admin/organizations/${slug}`);
  }

  // ===================== Users =====================

  async listUsers(orgSlug?: string): Promise<AdminUser[]> {
    const params = orgSlug ? { orgSlug } : {};
    const res = await this.client.get<AdminUser[]>('/auth/admin/users', { params });
    return res.data;
  }

  async inviteUser(request: InviteUserRequest): Promise<AdminUser> {
    const res = await this.client.post<AdminUser>('/auth/admin/users/invite', request);
    return res.data;
  }

  async createUser(request: CreateUserRequest): Promise<AdminUser> {
    const res = await this.client.post<AdminUser>('/auth/admin/users', request);
    return res.data;
  }

  async updateUser(userId: string, request: UpdateUserRequest): Promise<AdminUser> {
    const res = await this.client.put<AdminUser>(`/auth/admin/users/${userId}`, request);
    return res.data;
  }

  async deactivateUser(userId: string): Promise<void> {
    await this.client.post(`/auth/admin/users/${userId}/deactivate`);
  }

  async addUserRole(userId: string, orgSlug: string, role: string): Promise<void> {
    await this.client.post(`/auth/admin/users/${userId}/roles`, { orgSlug, role });
  }

  async removeUserRole(userId: string, orgSlug: string, role: string): Promise<void> {
    await this.client.delete(`/auth/admin/users/${userId}/roles/${role}`, {
      data: { orgSlug },
    });
  }

  async removeUserFromOrg(userId: string, orgSlug: string): Promise<void> {
    await this.client.delete(`/auth/admin/organizations/${orgSlug}/users/${userId}`);
  }

  // ===================== Roles =====================

  async listRoles(): Promise<AdminRole[]> {
    const res = await this.client.get<AdminRole[]>('/auth/admin/roles');
    return res.data;
  }

  async createRole(request: CreateRoleRequest): Promise<AdminRole> {
    const res = await this.client.post<AdminRole>('/auth/admin/roles', request);
    return res.data;
  }

  async assignRolePermissions(roleId: string, permissions: string[]): Promise<void> {
    await this.client.put(`/auth/admin/roles/${roleId}/permissions`, { permissions });
  }

  // ===================== Entitlements =====================

  async listEntitlements(orgSlug: string): Promise<Entitlement[]> {
    const res = await this.client.get<Entitlement[]>(`/auth/admin/organizations/${orgSlug}/entitlements`);
    return res.data;
  }

  async grantEntitlement(orgSlug: string, request: GrantEntitlementRequest): Promise<Entitlement> {
    const res = await this.client.post<Entitlement>(
      `/auth/admin/organizations/${orgSlug}/entitlements`,
      request,
    );
    return res.data;
  }

  async revokeEntitlement(orgSlug: string, product: string): Promise<void> {
    await this.client.delete(`/auth/admin/organizations/${orgSlug}/entitlements/${product}`);
  }

  // ===================== System Config =====================

  async listSystemConfig(): Promise<SystemConfig[]> {
    const res = await this.client.get<SystemConfig[]>('/admin/system/config');
    return res.data;
  }

  async updateSystemConfig(key: string, value: unknown): Promise<SystemConfig> {
    const res = await this.client.put<SystemConfig>(`/admin/system/config/${key}`, { value });
    return res.data;
  }
}

export const authApiService = new AuthApiService();
