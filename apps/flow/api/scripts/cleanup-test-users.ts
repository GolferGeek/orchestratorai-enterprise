#!/usr/bin/env ts-node
/**
 * Cleanup Test Users Script
 * 
 * Finds and deletes all test users from both auth.users and public.users tables.
 * Test users are identified by email patterns matching test user conventions.
 * 
 * Usage:
 *   ts-node scripts/cleanup-test-users.ts
 * 
 * Uses SUPABASE_TEST_USER and SUPABASE_TEST_PASSWORD from root .env file.
 * Falls back to ADMIN_PASSWORD if test user credentials are not available.
 */

import axios, { AxiosInstance } from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env from root directory (go up from apps/api/scripts to root)
const rootEnvPath = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  // Fallback to default dotenv behavior (current directory)
  dotenv.config();
}

if (!process.env.API_BASE_URL) {
  console.error('ERROR: API_BASE_URL environment variable is required');
  process.exit(1);
}
const API_BASE_URL = process.env.API_BASE_URL;

interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

interface User {
  id: string;
  email: string;
  displayName?: string;
}

// Test user email patterns to identify test users
const TEST_USER_PATTERNS = [
  /^test-.*@orchestratorai\.io$/i,
  /^test-golfer-.*@orchestratorai\.io$/i,  // Specific pattern for test-golfer users
  /^.*-test@orchestratorai\.io$/i,
  /^test.*@orchestratorai\.io$/i,
  /^golfer@orchestratorai\.io$/i,
  /^duplicate-test@orchestratorai\.io$/i,
  /^weak-password@orchestratorai\.io$/i,
];

// Use SUPABASE_TEST_USER and SUPABASE_TEST_PASSWORD from env, fallback to admin credentials
const testCredentials = {
  email: process.env.SUPABASE_TEST_USER || 'golfergeek@orchestratorai.io',
  password: process.env.SUPABASE_TEST_PASSWORD || process.env.ADMIN_PASSWORD || ''
};

async function authenticate(apiClient: AxiosInstance): Promise<string> {
  console.log('🔐 Authenticating...');
  console.log(`   Using: ${testCredentials.email}`);
  
  if (!testCredentials.password) {
    throw new Error(
      'SUPABASE_TEST_PASSWORD or ADMIN_PASSWORD environment variable is required. ' +
      'Please set SUPABASE_TEST_USER and SUPABASE_TEST_PASSWORD in your root .env file.'
    );
  }

  const response = await apiClient.post<AuthTokens>('/auth/login', testCredentials);
  const authToken = response.data.accessToken;
  
  apiClient.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
  apiClient.defaults.headers.common['x-organization-slug'] = '*';
  
  console.log('✅ Authentication successful\n');
  return authToken;
}

async function getAllUsers(apiClient: AxiosInstance): Promise<User[]> {
  console.log('📋 Fetching all users...');
  
  try {
    // Use the admin endpoint to get all users
    const response = await apiClient.get('/auth/admin/users');
    const users = response.data || [];
    
    const allUsers: User[] = users.map((user: any) => ({
      id: user.id,
      email: user.email || user.email_address || '',
      displayName: user.displayName || user.display_name
    }));
    
    console.log(`✅ Found ${allUsers.length} total users`);
    
    // Debug: Show all emails found
    if (allUsers.length > 0) {
      console.log('   Emails found:');
      allUsers.forEach(user => {
        console.log(`     - ${user.email || '(no email)'}`);
      });
    }
    console.log('');
    
    return allUsers;
  } catch (error) {
    console.error('❌ Failed to fetch users:', error);
    throw error;
  }
}

function isTestUser(email: string): boolean {
  return TEST_USER_PATTERNS.some(pattern => pattern.test(email));
}

async function deleteUser(apiClient: AxiosInstance, userId: string, email: string): Promise<boolean> {
  try {
    const response = await apiClient.delete(`/auth/admin/users/${userId}`);
    return response.data.success === true;
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        console.log(`   ⚠️  User ${email} not found (may already be deleted)`);
        return true; // Already deleted, consider success
      }
      console.error(`   ❌ Failed to delete ${email}: ${error.response?.data?.message || error.message}`);
    } else {
      console.error(`   ❌ Failed to delete ${email}:`, error);
    }
    return false;
  }
}

async function deleteUsersByUids(apiClient: AxiosInstance, uids: string[]): Promise<void> {
  console.log(`🗑️  Deleting ${uids.length} user(s) by UID...\n`);

  let deletedCount = 0;
  let failedCount = 0;

  for (const uid of uids) {
    console.log(`🗑️  Deleting user ${uid}...`);
    const success = await deleteUser(apiClient, uid, uid);
    if (success) {
      deletedCount++;
      console.log(`   ✅ Deleted successfully\n`);
    } else {
      failedCount++;
      console.log(`   ❌ Failed to delete\n`);
    }
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════');
  console.log('   Deletion Summary');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Total users to delete: ${uids.length}`);
  console.log(`Successfully deleted: ${deletedCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log('═══════════════════════════════════════════════════════\n');
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('   Test Users Cleanup Script');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`API Base URL: ${API_BASE_URL}\n`);

  const apiClient: AxiosInstance = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json'
    }
  });

  try {
    // Authenticate
    await authenticate(apiClient);

    // Check if UIDs were provided as command line arguments
    const uidsToDelete = process.argv.slice(2).filter(arg => 
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(arg)
    );

    if (uidsToDelete.length > 0) {
      // Delete specific UIDs provided as arguments
      await deleteUsersByUids(apiClient, uidsToDelete);
      return;
    }

    // Otherwise, search for test users by email pattern
    // Get all users
    const allUsers = await getAllUsers(apiClient);

    // Filter test users
    const testUsers = allUsers.filter(user => isTestUser(user.email));

    if (testUsers.length === 0) {
      console.log('✅ No test users found to delete.\n');
      console.log('💡 Tip: You can delete specific users by providing their UIDs as arguments:');
      console.log('   ts-node scripts/cleanup-test-users.ts <uid1> <uid2> <uid3>...\n');
      return;
    }

    console.log(`🔍 Found ${testUsers.length} test user(s) to delete:\n`);
    testUsers.forEach(user => {
      console.log(`   - ${user.email} (${user.id})`);
    });
    console.log('');

    // Delete each test user
    let deletedCount = 0;
    let failedCount = 0;

    for (const user of testUsers) {
      console.log(`🗑️  Deleting ${user.email}...`);
      const success = await deleteUser(apiClient, user.id, user.email);
      if (success) {
        deletedCount++;
        console.log(`   ✅ Deleted successfully\n`);
      } else {
        failedCount++;
        console.log(`   ❌ Failed to delete\n`);
      }
    }

    // Summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('   Cleanup Summary');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Total test users found: ${testUsers.length}`);
    console.log(`Successfully deleted: ${deletedCount}`);
    console.log(`Failed: ${failedCount}`);
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);

