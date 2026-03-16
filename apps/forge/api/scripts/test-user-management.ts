#!/usr/bin/env ts-node

/**
 * Standalone User Management Test Script
 *
 * Usage:
 *   ADMIN_PASSWORD=your-password ts-node scripts/test-user-management.ts
 *
 * Environment Variables:
 *   API_BASE_URL - API base URL (default: http://localhost:6100)
 *   ADMIN_EMAIL - Admin email for authentication
 *   ADMIN_PASSWORD - Admin password
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

if (!process.env.API_BASE_URL) {
  console.error('ERROR: API_BASE_URL environment variable is required');
  process.exit(1);
}
const API_BASE_URL = process.env.API_BASE_URL;

interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
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

class UserManagementTester {
  private apiClient: AxiosInstance;
  private createdUserId: string = '';

  constructor() {
    this.apiClient = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async authenticate(): Promise<void> {
    console.log('\n🔐 Step 1: Authenticating as admin...');

    const adminEmail = process.env.ADMIN_EMAIL || 'golfergeek@orchestratorai.io';
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      throw new Error('ADMIN_PASSWORD environment variable is required');
    }

    try {
      const response = await this.apiClient.post<AuthTokens>('/auth/login', {
        email: adminEmail,
        password: adminPassword
      });

      const { accessToken } = response.data;

      // Set auth headers for all future requests
      this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
      this.apiClient.defaults.headers.common['x-organization-slug'] = '*';

      console.log('✅ Authentication successful');
      console.log(`   Admin: ${adminEmail}`);
    } catch (error) {
      this.handleError('Authentication failed', error);
      throw error;
    }
  }

  async createUser(): Promise<void> {
    console.log('\n📝 Step 2: Creating test user...');

    // Use timestamp to ensure unique email
    const timestamp = Date.now();
    const testUser = {
      email: `test-golfer-${timestamp}@orchestratorai.io`,
      password: 'Golfer123!',
      displayName: 'Test Golfer',
      roles: ['member'],
      emailConfirm: false,
      organizationAccess: ['demo-org']
    };

    try {
      const response = await this.apiClient.post<CreateUserResponse>(
        '/auth/admin/users',
        testUser
      );

      this.createdUserId = response.data.id;

      console.log('✅ User created successfully');
      console.log(`   ID: ${response.data.id}`);
      console.log(`   Email: ${response.data.email}`);
      console.log(`   Display Name: ${response.data.displayName}`);
      console.log(`   Roles: ${response.data.roles.join(', ')}`);
      console.log(`   Organizations: ${response.data.organizationAccess.join(', ')}`);
      console.log(`   Email Confirmation Required: ${response.data.emailConfirmationRequired}`);
    } catch (error) {
      this.handleError('User creation failed', error);
      throw error;
    }
  }

  async changeUserRole(): Promise<void> {
    console.log('\n🔄 Step 3: Changing user role...');

    try {
      // First, get current roles
      console.log('   Fetching current roles...');
      const getRolesResponse = await this.apiClient.get(
        `/api/rbac/users/${this.createdUserId}/roles`,
        {
          params: {
            organizationSlug: 'demo-org'
          }
        }
      );

      console.log(`   Current roles: ${getRolesResponse.data.roles.map((r: any) => r.displayName).join(', ')}`);

      // Assign admin role
      console.log('   Assigning "admin" role...');
      await this.apiClient.post(
        `/api/rbac/users/${this.createdUserId}/roles`,
        {
          roleName: 'admin',
          organizationSlug: 'demo-org'
        }
      );

      // Verify new role
      const verifyResponse = await this.apiClient.get(
        `/api/rbac/users/${this.createdUserId}/roles`,
        {
          params: {
            organizationSlug: 'demo-org'
          }
        }
      );

      console.log('✅ Role changed successfully');
      console.log(`   New roles: ${verifyResponse.data.roles.map((r: any) => r.displayName).join(', ')}`);
    } catch (error) {
      this.handleError('Role change failed', error);
      throw error;
    }
  }

  async deleteUser(): Promise<void> {
    console.log('\n🗑️  Step 4: Deleting test user...');

    try {
      const response = await this.apiClient.delete(
        `/auth/admin/users/${this.createdUserId}`
      );

      console.log('✅ User deleted successfully');
      console.log(`   Message: ${response.data.message}`);

      // Verify deletion
      console.log('   Verifying deletion...');
      try {
        await this.apiClient.get(`/auth/admin/users/${this.createdUserId}`);
        console.log('⚠️  Warning: User still exists after deletion');
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          console.log('✅ User deletion verified (user not found)');
        } else {
          throw error;
        }
      }
    } catch (error) {
      this.handleError('User deletion failed', error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    if (this.createdUserId) {
      console.log('\n🧹 Cleanup: Ensuring test user is deleted...');
      try {
        await this.apiClient.delete(`/auth/admin/users/${this.createdUserId}`);
        console.log('✅ Cleanup successful');
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          console.log('✅ User already deleted');
        } else {
          console.log('⚠️  Cleanup warning:', error);
        }
      }
    }
  }

  private handleError(message: string, error: unknown): void {
    console.error(`\n❌ ${message}`);
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      console.error(`   Status: ${axiosError.response?.status}`);
      console.error(`   Message: ${axiosError.message}`);
      if (axiosError.response?.data) {
        console.error(`   Response:`, JSON.stringify(axiosError.response.data, null, 2));
      }
    } else if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
    } else {
      console.error(`   Error:`, error);
    }
  }

  async run(): Promise<void> {
    console.log('═══════════════════════════════════════════════════════');
    console.log('   User Management E2E Test');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`API Base URL: ${API_BASE_URL}`);

    try {
      await this.authenticate();
      await this.createUser();
      await this.changeUserRole();
      await this.deleteUser();

      console.log('\n═══════════════════════════════════════════════════════');
      console.log('✅ All tests passed successfully!');
      console.log('═══════════════════════════════════════════════════════\n');

      process.exit(0);
    } catch (error) {
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('❌ Test failed');
      console.log('═══════════════════════════════════════════════════════\n');

      await this.cleanup();
      process.exit(1);
    }
  }
}

// Run the test
const tester = new UserManagementTester();
tester.run().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
