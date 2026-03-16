import { apiService } from './apiService';

export interface User {
  id: string;
  email: string;
  displayName?: string;
  roles: string[];
  createdAt: string;
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
      return await apiService.post<CreateUserResponse, CreateUserRequest>('/auth/admin/users', request, {
        headers: this.getOrgHeaders()
      });
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
      return await apiService.get<User[]>('/auth/admin/users', {
        headers: this.getOrgHeaders()
      });
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
      return await apiService.get<User>(`/auth/admin/users/${userId}`, {
        headers: this.getOrgHeaders()
      });
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
      return await apiService.put<UserManagementResponse, UpdateUserRolesRequest>(`/auth/admin/users/${userId}/roles`, request, {
        headers: this.getOrgHeaders()
      });
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
      return await apiService.post<UserManagementResponse, AddUserRoleRequest>(`/auth/admin/users/${userId}/roles`, request, {
        headers: this.getOrgHeaders()
      });
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
      return await apiService.delete<UserManagementResponse>(`/auth/admin/users/${userId}/roles/${role}`, {
        headers: this.getOrgHeaders()
      });
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
      return await apiService.delete<UserManagementResponse>(`/auth/admin/users/${userId}`, {
        headers: this.getOrgHeaders()
      });
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
      return await apiService.put<UserManagementResponse, { newPassword: string }>(`/auth/admin/users/${userId}/password`, {
        newPassword
      }, {
        headers: this.getOrgHeaders()
      });
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
      return await apiService.post<UserManagementResponse, { email: string }>('/auth/password-reset', {
        email
      }, {
        headers: this.getOrgHeaders()
      });
    } catch (error) {
      console.error('Failed to initiate password reset:', error);
      throw error;
    }
  }
}

export const userManagementService = new UserManagementService();
