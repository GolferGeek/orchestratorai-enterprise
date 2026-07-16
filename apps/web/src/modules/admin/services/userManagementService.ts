import axios, { AxiosInstance, AxiosError } from 'axios';

export interface User {
  id: string;
  email: string;
  displayName?: string;
  organizationSlug?: string;
  roles: string[];
  createdAt: string;
  status: string;
}

interface AdminUserApiRow {
  id: string;
  email: string;
  displayName?: string;
  display_name?: string;
  organization_slug?: string | null;
  roles?: string[];
  createdAt?: string;
  created_at?: string;
  status: string;
}

export interface UpdateUserRolesRequest {
  roles: string[];
  reason?: string;
}

export interface AddUserRoleRequest {
  role: string;
  reason?: string;
}

export interface RemoveUserRoleRequest {
  reason?: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  displayName?: string;
  roles?: string[];
  emailConfirm?: boolean;
  organizationAccess?: string[];
}

export interface CreateUserResponse {
  id: string;
  email: string;
  displayName?: string;
  roles: string[];
  emailConfirmationRequired: boolean;
  message: string;
}

export interface UserManagementResponse {
  success: boolean;
  message: string;
}

class UserManagementService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: import.meta.env.VITE_API_BASE_URL || '/',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('authToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

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

  private normalizeUser(row: AdminUserApiRow): User {
    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName ?? row.display_name,
      organizationSlug: row.organization_slug ?? undefined,
      roles: row.roles ?? [],
      createdAt: row.createdAt ?? row.created_at ?? '',
      status: row.status,
    };
  }

  /**
   * Get organization headers for API requests
   * For admin operations, use '*' as organization slug (global operations)
   * Auth token is handled automatically by apiService
   */
  private getOrgHeaders(): Record<string, string> {
    return {
      'x-organization-slug': '*',
    };
  }
  /**
   * Create new user (admin only)
   */
  async createUser(request: CreateUserRequest): Promise<CreateUserResponse> {
    try {
      const response = await this.client.post<CreateUserResponse>('/auth/admin/users', request, {
        headers: this.getOrgHeaders(),
      });
      return response.data;
    } catch (error) {
      console.error('Failed to create user:', error);
      throw error;
    }
  }

  /**
   * Get all users (admin only)
   */
  async getAllUsers(): Promise<User[]> {
    try {
      const response = await this.client.get<AdminUserApiRow[]>('/auth/admin/users', {
        headers: this.getOrgHeaders(),
      });
      return response.data.map((row) => this.normalizeUser(row));
    } catch (error) {
      console.error('Failed to fetch users:', error);
      throw error;
    }
  }

  /**
   * Get user by ID (admin only)
   */
  async getUserById(userId: string): Promise<User> {
    try {
      const response = await this.client.get<User>(`/auth/admin/users/${userId}`, {
        headers: this.getOrgHeaders(),
      });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch user:', error);
      throw error;
    }
  }

  /**
   * Set user roles (admin only)
   */
  async setUserRoles(userId: string, request: UpdateUserRolesRequest): Promise<UserManagementResponse> {
    try {
      const response = await this.client.put<UserManagementResponse>(`/auth/admin/users/${userId}/roles`, request, {
        headers: this.getOrgHeaders(),
      });
      return response.data;
    } catch (error) {
      console.error('Failed to set user roles:', error);
      throw error;
    }
  }

  /**
   * Add role to user (admin only)
   */
  async addUserRole(userId: string, request: AddUserRoleRequest): Promise<UserManagementResponse> {
    try {
      const response = await this.client.post<UserManagementResponse>(`/auth/admin/users/${userId}/roles`, request, {
        headers: this.getOrgHeaders(),
      });
      return response.data;
    } catch (error) {
      console.error('Failed to add user role:', error);
      throw error;
    }
  }

  /**
   * Remove role from user (admin only)
   */
  async removeUserRole(userId: string, role: string, _request: RemoveUserRoleRequest): Promise<UserManagementResponse> {
    try {
      const response = await this.client.delete<UserManagementResponse>(`/auth/admin/users/${userId}/roles/${role}`, {
        headers: this.getOrgHeaders(),
      });
      return response.data;
    } catch (error) {
      console.error('Failed to remove user role:', error);
      throw error;
    }
  }

  /**
   * Delete user (admin only)
   */
  async deleteUser(userId: string): Promise<UserManagementResponse> {
    try {
      const response = await this.client.delete<UserManagementResponse>(`/auth/admin/users/${userId}`, {
        headers: this.getOrgHeaders(),
      });
      return response.data;
    } catch (error) {
      console.error('Failed to delete user:', error);
      throw error;
    }
  }

  /**
   * Change user password (admin only)
   */
  async changeUserPassword(userId: string, newPassword: string): Promise<UserManagementResponse> {
    try {
      const response = await this.client.put<UserManagementResponse>(`/auth/admin/users/${userId}/password`, {
        newPassword,
      }, {
        headers: this.getOrgHeaders(),
      });
      return response.data;
    } catch (error) {
      console.error('Failed to change user password:', error);
      throw error;
    }
  }

  /**
   * Initiate password reset for a user
   */
  async initiatePasswordReset(email: string): Promise<UserManagementResponse> {
    try {
      const response = await this.client.post<UserManagementResponse>('/auth/password-reset', {
        email,
      }, {
        headers: this.getOrgHeaders(),
      });
      return response.data;
    } catch (error) {
      console.error('Failed to initiate password reset:', error);
      throw error;
    }
  }
}

export const userManagementService = new UserManagementService();
