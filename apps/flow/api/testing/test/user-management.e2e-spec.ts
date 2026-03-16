import axios, { AxiosInstance } from 'axios';
import { getApiUrl } from './test-env';

/**
 * E2E Test for User Management
 * Tests: Create User -> Change Role -> Delete User
 */

const API_BASE_URL = getApiUrl();

interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

interface CreateUserRequest {
  email: string;
  password: string;
  displayName?: string;
  roles?: string[];
  emailConfirm?: boolean;
  organizationAccess?: string[];
}

interface CreateUserResponse {
  id: string;
  email: string;
  displayName?: string;
  roles: string[];
  emailConfirmationRequired: boolean;
  message: string;
  organizationAccess: string[];
}

describe('User Management E2E Test', () => {
  let authToken: string;
  let createdUserId: string;
  let apiClient: AxiosInstance;

  const testUser = {
    email: 'golfer@orchestratorai.io',
    password: 'Golfer123!',
    displayName: 'Golfer',
    roles: ['member'],
    emailConfirm: false,
    organizationAccess: ['finance']
  };

  const adminCredentials = {
    email: 'golfergeek@orchestratorai.io', // Replace with your admin email
    password: process.env.ADMIN_PASSWORD || 'your-admin-password'
  };

  beforeAll(async () => {
    // Create axios instance for tests
    apiClient = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Set up authentication - login as admin
    console.log('🔐 Authenticating as admin...');
    const loginResponse = await apiClient.post<AuthTokens>('/auth/login', adminCredentials);
    authToken = loginResponse.data.accessToken;

    // Set auth header for all future requests
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
    apiClient.defaults.headers.common['x-organization-slug'] = '*';

    console.log('✅ Authentication successful');
  });

  afterAll(async () => {
    // Cleanup: ensure test user is deleted even if tests fail
    if (createdUserId) {
      try {
        await apiClient.delete(`/auth/admin/users/${createdUserId}`);
        console.log('🧹 Cleanup: Test user deleted');
      } catch (error) {
        console.log('⚠️ Cleanup: User may already be deleted');
      }
    }
  });

  describe('User Creation', () => {
    it('should create a new user with specified details', async () => {
      console.log('\n📝 Creating test user...');

      const response = await apiClient.post<CreateUserResponse>(
        '/auth/admin/users',
        testUser
      );

      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('id');
      expect(response.data.email).toBe(testUser.email);
      expect(response.data.displayName).toBe(testUser.displayName);
      expect(response.data.roles).toContain('member');
      expect(response.data.organizationAccess).toContain('finance');

      // Store user ID for subsequent tests
      createdUserId = response.data.id;

      console.log(`✅ User created successfully with ID: ${createdUserId}`);
      console.log(`   Email: ${response.data.email}`);
      console.log(`   Display Name: ${response.data.displayName}`);
      console.log(`   Roles: ${response.data.roles.join(', ')}`);
    });

    it('should verify user exists in organization', async () => {
      console.log('\n🔍 Verifying user in organization...');

      const response = await apiClient.get('/api/rbac/organizations/finance/users');

      const foundUser = response.data.users.find((u: any) => u.userId === createdUserId);
      expect(foundUser).toBeDefined();
      expect(foundUser.email).toBe(testUser.email);

      console.log('✅ User verified in organization');
    });
  });

  describe('Role Management', () => {
    it('should get current user roles', async () => {
      console.log('\n🔍 Getting current user roles...');

      const response = await apiClient.get(
        `/api/rbac/users/${createdUserId}/roles`,
        {
          params: {
            organizationSlug: 'finance'
          }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.roles).toBeDefined();
      expect(response.data.roles.some((r: any) => r.name === 'member')).toBe(true);

      console.log(`✅ Current roles: ${response.data.roles.map((r: any) => r.displayName).join(', ')}`);
    });

    it('should assign a new role to the user', async () => {
      console.log('\n🔄 Assigning "admin" role to user...');

      const response = await apiClient.post(
        `/api/rbac/users/${createdUserId}/roles`,
        {
          roleName: 'admin',
          organizationSlug: 'finance'
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      console.log('✅ Role assigned successfully');
    });

    it('should verify the new role was assigned', async () => {
      console.log('\n🔍 Verifying role assignment...');

      const response = await apiClient.get(
        `/api/rbac/users/${createdUserId}/roles`,
        {
          params: {
            organizationSlug: 'finance'
          }
        }
      );

      const roles = response.data.roles.map((r: any) => r.name);
      expect(roles).toContain('member');
      expect(roles).toContain('admin');

      console.log(`✅ Roles verified: ${response.data.roles.map((r: any) => r.displayName).join(', ')}`);
    });

    it('should revoke a role from the user', async () => {
      console.log('\n🔄 Revoking "admin" role from user...');

      const response = await apiClient.delete(
        `/api/rbac/users/${createdUserId}/roles/admin`,
        {
          params: {
            organizationSlug: 'finance'
          }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      console.log('✅ Role revoked successfully');
    });

    it('should verify role was revoked', async () => {
      console.log('\n🔍 Verifying role revocation...');

      const response = await apiClient.get(
        `/api/rbac/users/${createdUserId}/roles`,
        {
          params: {
            organizationSlug: 'finance'
          }
        }
      );

      const roles = response.data.roles.map((r: any) => r.name);
      expect(roles).toContain('member');
      expect(roles).not.toContain('admin');

      console.log(`✅ Roles verified: ${response.data.roles.map((r: any) => r.displayName).join(', ')}`);
    });
  });

  describe('Password Management', () => {
    it('should change user password', async () => {
      console.log('\n🔐 Changing user password...');

      const response = await apiClient.put(
        `/auth/admin/users/${createdUserId}/password`,
        {
          newPassword: 'NewPassword123!'
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      console.log('✅ Password changed successfully');
    });

    it('should verify user can login with new password', async () => {
      console.log('\n🔍 Verifying login with new password...');

      // Create a new client without auth headers for login test
      const loginClient = axios.create({
        baseURL: API_BASE_URL,
        timeout: 10000
      });

      const response = await loginClient.post<AuthTokens>('/auth/login', {
        email: testUser.email,
        password: 'NewPassword123!'
      });

      expect(response.status).toBe(200);
      expect(response.data.accessToken).toBeDefined();

      console.log('✅ Login successful with new password');
    });
  });

  describe('User Deletion', () => {
    it('should delete the user', async () => {
      console.log('\n🗑️  Deleting test user...');

      const response = await apiClient.delete(`/auth/admin/users/${createdUserId}`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.message).toContain('deleted successfully');

      console.log('✅ User deleted successfully');

      // Clear the ID so afterAll doesn't try to delete again
      createdUserId = '';
    });

    it('should verify user no longer exists', async () => {
      console.log('\n🔍 Verifying user deletion...');

      // Try to get user - should fail
      await expect(
        apiClient.get(`/auth/admin/users/${createdUserId}`)
      ).rejects.toThrow();

      console.log('✅ User confirmed deleted');
    });

    it('should verify user not in organization', async () => {
      console.log('\n🔍 Verifying user not in organization list...');

      const response = await apiClient.get('/api/rbac/organizations/finance/users');

      const foundUser = response.data.users.find((u: any) => u.userId === createdUserId);
      expect(foundUser).toBeUndefined();

      console.log('✅ User confirmed removed from organization');
    });
  });

  describe('Error Handling', () => {
    it('should reject duplicate email', async () => {
      console.log('\n🧪 Testing duplicate email rejection...');

      // Create first user
      const response1 = await apiClient.post<CreateUserResponse>(
        '/auth/admin/users',
        {
          email: 'duplicate-test@orchestratorai.io',
          password: 'Test123!',
          displayName: 'Duplicate Test',
          emailConfirm: false
        }
      );

      const userId = response1.data.id;

      // Try to create duplicate - should fail
      await expect(
        apiClient.post<CreateUserResponse>(
          '/auth/admin/users',
          {
            email: 'duplicate-test@orchestratorai.io',
            password: 'Test123!',
            displayName: 'Duplicate Test 2',
            emailConfirm: false
          }
        )
      ).rejects.toThrow();

      console.log('✅ Duplicate email correctly rejected');

      // Cleanup
      await apiClient.delete(`/auth/admin/users/${userId}`);
    });

    it('should reject self-deletion', async () => {
      console.log('\n🧪 Testing self-deletion prevention...');

      // Get current user ID from token
      const meResponse = await apiClient.get('/auth/me');
      const currentUserId = meResponse.data.id;

      // Try to delete self - should fail
      await expect(
        apiClient.delete(`/auth/admin/users/${currentUserId}`)
      ).rejects.toThrow();

      console.log('✅ Self-deletion correctly prevented');
    });

    it('should reject weak password', async () => {
      console.log('\n🧪 Testing weak password rejection...');

      // Try to create user with weak password
      await expect(
        apiClient.post<CreateUserResponse>(
          '/auth/admin/users',
          {
            email: 'weak-password@orchestratorai.io',
            password: '123', // Too short
            displayName: 'Weak Password Test',
            emailConfirm: false
          }
        )
      ).rejects.toThrow();

      console.log('✅ Weak password correctly rejected');
    });
  });
});
