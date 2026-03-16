/**
 * RBAC Service
 * Handles all RBAC-related API calls
 */
import axios from 'axios';
import { getSecureApiBaseUrl, getSecureHeaders } from '../utils/securityConfig';

const API_BASE_URL = getSecureApiBaseUrl();

export interface RbacRole {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  isSystem: boolean;
}

export interface RbacPermission {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  category?: string;
}

export interface UserRole {
  id: string;
  name: string;
  displayName: string;
  isGlobal: boolean;
  assignedAt: string;
  expiresAt?: string;
}

export interface UserPermission {
  permission: string;
  resourceType?: string;
  resourceId?: string;
}

export interface UserOrganization {
  organizationSlug: string;
  organizationName: string;
  roleName: string;
  isGlobal: boolean;
}

export interface OrganizationUser {
  userId: string;
  email: string;
  displayName?: string;
  roles: UserRole[];
}

export interface AuditLogEntry {
  id: string;
  action: string;
  actorId: string;
  targetUserId: string;
  targetRoleId: string;
  organizationSlug: string;
  details: Record<string, unknown>;
  createdAt: string;
}

class RbacService {
  /**
   * Get auth token from storage
   * TokenStorageService migrates tokens from localStorage to sessionStorage,
   * so we check sessionStorage first, then fall back to localStorage
   */
  private getAuthToken(): string | null {
    return sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
  }

  private getAuthHeaders(): Record<string, string> {
    const token = this.getAuthToken();
    return {
      ...getSecureHeaders(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private getOrgHeaders(organizationSlug: string): Record<string, string> {
    return {
      ...this.getAuthHeaders(),
      'x-organization-slug': organizationSlug,
    };
  }

  // ==================== ROLES ====================

  /**
   * Get all available roles
   */
  async getAllRoles(): Promise<RbacRole[]> {
    const response = await axios.get<{ roles: RbacRole[] }>(
      `${API_BASE_URL}/api/rbac/roles`,
      { headers: this.getAuthHeaders() }
    );
    return response.data.roles;
  }

  /**
   * Get all available permissions (grouped by category)
   */
  async getAllPermissions(): Promise<{
    permissions: RbacPermission[];
    grouped: Record<string, RbacPermission[]>;
  }> {
    const response = await axios.get<{
      permissions: RbacPermission[];
      grouped: Record<string, RbacPermission[]>;
    }>(`${API_BASE_URL}/api/rbac/permissions`, { headers: this.getAuthHeaders() });
    return response.data;
  }

  /**
   * Get permissions for a specific role
   */
  async getRolePermissions(roleId: string): Promise<string[]> {
    const response = await axios.get<{ permissions: string[] }>(
      `${API_BASE_URL}/api/rbac/roles/${roleId}/permissions`,
      { headers: this.getAuthHeaders() }
    );
    return response.data.permissions;
  }

  /**
   * Add permission to a role
   */
  async addPermissionToRole(roleId: string, permissionId: string): Promise<void> {
    await axios.post(
      `${API_BASE_URL}/api/rbac/roles/${roleId}/permissions/${permissionId}`,
      {},
      { headers: this.getAuthHeaders() }
    );
  }

  /**
   * Remove permission from a role
   */
  async removePermissionFromRole(roleId: string, permissionId: string): Promise<void> {
    await axios.delete(
      `${API_BASE_URL}/api/rbac/roles/${roleId}/permissions/${permissionId}`,
      { headers: this.getAuthHeaders() }
    );
  }

  // ==================== CURRENT USER ====================

  /**
   * Get current user's roles in an organization
   */
  async getMyRoles(organizationSlug: string): Promise<UserRole[]> {
    const response = await axios.get<{ roles: UserRole[] }>(
      `${API_BASE_URL}/api/rbac/me/roles`,
      {
        headers: this.getAuthHeaders(),
        params: { organizationSlug },
      }
    );
    return response.data.roles;
  }

  /**
   * Get current user's permissions in an organization
   */
  async getMyPermissions(organizationSlug: string): Promise<UserPermission[]> {
    const response = await axios.get<{ permissions: UserPermission[] }>(
      `${API_BASE_URL}/api/rbac/me/permissions`,
      {
        headers: this.getAuthHeaders(),
        params: { organizationSlug },
      }
    );
    return response.data.permissions;
  }

  /**
   * Get current user's organizations
   */
  async getMyOrganizations(): Promise<UserOrganization[]> {
    const response = await axios.get<{ organizations: UserOrganization[] }>(
      `${API_BASE_URL}/api/rbac/me/organizations`,
      { headers: this.getAuthHeaders() }
    );
    return response.data.organizations;
  }

  /**
   * Check if current user is super-admin
   */
  async checkSuperAdmin(): Promise<boolean> {
    const response = await axios.get<{ isSuperAdmin: boolean }>(
      `${API_BASE_URL}/api/rbac/me/is-super-admin`,
      { headers: this.getAuthHeaders() }
    );
    return response.data.isSuperAdmin;
  }

  /**
   * Check if current user has a specific permission
   */
  async checkPermission(
    organizationSlug: string,
    permission: string,
    resourceType?: string,
    resourceId?: string
  ): Promise<boolean> {
    const response = await axios.get<{ hasPermission: boolean }>(
      `${API_BASE_URL}/api/rbac/check`,
      {
        headers: this.getAuthHeaders(),
        params: { organizationSlug, permission, resourceType, resourceId },
      }
    );
    return response.data.hasPermission;
  }

  // ==================== USER ROLE MANAGEMENT (ADMIN) ====================

  /**
   * Get a user's roles in an organization
   */
  async getUserRoles(userId: string, organizationSlug: string): Promise<UserRole[]> {
    const response = await axios.get<{ roles: UserRole[] }>(
      `${API_BASE_URL}/api/rbac/users/${userId}/roles`,
      { headers: this.getOrgHeaders(organizationSlug), params: { organizationSlug } }
    );
    return response.data.roles;
  }

  /**
   * Get a user's permissions in an organization
   */
  async getUserPermissions(userId: string, organizationSlug: string): Promise<UserPermission[]> {
    const response = await axios.get<{ permissions: UserPermission[] }>(
      `${API_BASE_URL}/api/rbac/users/${userId}/permissions`,
      { headers: this.getOrgHeaders(organizationSlug), params: { organizationSlug } }
    );
    return response.data.permissions;
  }

  /**
   * Assign role to a user
   */
  async assignRole(
    userId: string,
    organizationSlug: string,
    roleName: string,
    expiresAt?: string
  ): Promise<void> {
    await axios.post(
      `${API_BASE_URL}/api/rbac/users/${userId}/roles`,
      { organizationSlug, roleName, expiresAt },
      { headers: this.getOrgHeaders(organizationSlug) }
    );
  }

  /**
   * Revoke role from a user
   */
  async revokeRole(userId: string, organizationSlug: string, roleName: string): Promise<void> {
    await axios.delete(
      `${API_BASE_URL}/api/rbac/users/${userId}/roles/${roleName}`,
      { headers: this.getOrgHeaders(organizationSlug), params: { organizationSlug } }
    );
  }

  // ==================== ORGANIZATION USER MANAGEMENT ====================

  /**
   * Get all users in an organization with their roles
   */
  async getOrganizationUsers(organizationSlug: string): Promise<OrganizationUser[]> {
    const response = await axios.get<{ users: OrganizationUser[] }>(
      `${API_BASE_URL}/api/rbac/organizations/${organizationSlug}/users`,
      { headers: this.getOrgHeaders(organizationSlug) }
    );
    return response.data.users;
  }

  // ==================== AUDIT LOG ====================

  /**
   * Get RBAC audit log
   */
  async getAuditLog(organizationSlug?: string, limit = 100): Promise<AuditLogEntry[]> {
    const headers = organizationSlug ? this.getOrgHeaders(organizationSlug) : this.getAuthHeaders();
    const response = await axios.get<{ entries: AuditLogEntry[] }>(
      `${API_BASE_URL}/api/rbac/audit`,
      { headers, params: { organizationSlug, limit } }
    );
    return response.data.entries;
  }
}

export const rbacService = new RbacService();
export default rbacService;
