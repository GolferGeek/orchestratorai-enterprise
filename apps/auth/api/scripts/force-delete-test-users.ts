#!/usr/bin/env ts-node
/**
 * Force Delete Test Users Script
 * 
 * Deletes test users by first cleaning up all related data that might prevent deletion,
 * then deleting from auth.users. This handles constraints that don't cascade.
 * 
 * Usage:
 *   ts-node scripts/force-delete-test-users.ts <uid1> <uid2> ...
 * 
 * Uses SUPABASE_TEST_USER and SUPABASE_TEST_PASSWORD from root .env file.
 */

import axios, { AxiosInstance } from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Load .env from root directory
const rootEnvPath = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config();
}

if (!process.env.API_BASE_URL) {
  console.error('ERROR: API_BASE_URL environment variable is required');
  process.exit(1);
}
const API_BASE_URL = process.env.API_BASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

const testCredentials = {
  email: process.env.SUPABASE_TEST_USER || 'golfergeek@orchestratorai.io',
  password: process.env.SUPABASE_TEST_PASSWORD || process.env.ADMIN_PASSWORD || ''
};

async function authenticate(apiClient: AxiosInstance): Promise<string> {
  console.log('🔐 Authenticating...');
  console.log(`   Using: ${testCredentials.email}`);
  
  if (!testCredentials.password) {
    throw new Error('SUPABASE_TEST_PASSWORD or ADMIN_PASSWORD environment variable is required');
  }

  const response = await apiClient.post<AuthTokens>('/auth/login', testCredentials);
  const authToken = response.data.accessToken;
  
  apiClient.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
  apiClient.defaults.headers.common['x-organization-slug'] = '*';
  
  console.log('✅ Authentication successful\n');
  return authToken;
}

async function cleanupUserData(supabase: any, userId: string): Promise<void> {
  console.log(`   🧹 Cleaning up related data for ${userId}...`);
  
  // Delete RBAC audit log entries where user is actor or target
  await supabase
    .from('rbac_audit_log')
    .delete()
    .or(`actor_id.eq.${userId},target_user_id.eq.${userId}`);
  
  // Update RBAC assignments where user is assigned_by (set to NULL)
  await supabase
    .from('rbac_user_org_roles')
    .update({ assigned_by: null })
    .eq('assigned_by', userId);
  
  // Delete RBAC assignments for this user
  await supabase
    .from('rbac_user_org_roles')
    .delete()
    .eq('user_id', userId);
  
  // Delete from public.users if exists
  await supabase
    .from('users')
    .delete()
    .eq('id', userId);
  
  // Delete task_messages (should cascade, but explicit is safer)
  await supabase
    .from('task_messages')
    .delete()
    .eq('user_id', userId);
  
  // Delete tasks (should cascade, but explicit is safer)
  await supabase
    .from('tasks')
    .delete()
    .eq('user_id', userId);
  
  // Delete plans
  await supabase
    .from('plans')
    .delete()
    .eq('user_id', userId);
  
  // Delete conversations
  await supabase
    .from('conversations')
    .delete()
    .eq('user_id', userId);
  
  // Delete assets
  await supabase
    .from('assets')
    .delete()
    .eq('user_id', userId);
  
  // Delete user_cidafm_commands
  await supabase
    .from('user_cidafm_commands')
    .delete()
    .eq('user_id', userId);
  
  // Update other tables that reference this user (set to NULL)
  await supabase
    .from('llm_usage')
    .update({ user_id: null })
    .eq('user_id', userId);
  
  await supabase
    .from('observability_events')
    .update({ user_id: null })
    .eq('user_id', userId);
  
  await supabase
    .from('plan_versions')
    .update({ created_by_id: null })
    .eq('created_by_id', userId);
  
  await supabase
    .from('plans')
    .update({ created_by: null })
    .eq('created_by', userId);
  
  await supabase
    .from('plans')
    .update({ approved_by: null })
    .eq('approved_by', userId);
  
  console.log(`   ✅ Cleanup complete`);
}

async function deleteUserFromAuth(supabase: any, userId: string): Promise<boolean> {
  try {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
      console.error(`   ❌ Failed to delete from auth.users: ${error.message}`);
      return false;
    }
    return true;
  } catch (error: any) {
    console.error(`   ❌ Error deleting from auth.users: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('   Force Delete Test Users Script');
  console.log('═══════════════════════════════════════════════════════');
  
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }
  
  // Get UIDs from command line arguments
  const uidsToDelete = process.argv.slice(2).filter(arg => 
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(arg)
  );

  if (uidsToDelete.length === 0) {
    console.error('❌ No valid UIDs provided. Usage:');
    console.error('   ts-node scripts/force-delete-test-users.ts <uid1> <uid2> ...\n');
    process.exit(1);
  }

  console.log(`📋 Will delete ${uidsToDelete.length} user(s):\n`);
  uidsToDelete.forEach(uid => console.log(`   - ${uid}`));
  console.log('');

  // Create Supabase service client
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  let deletedCount = 0;
  let failedCount = 0;

  for (const uid of uidsToDelete) {
    console.log(`🗑️  Processing user ${uid}...`);
    
    try {
      // Step 1: Clean up all related data
      await cleanupUserData(supabase, uid);
      
      // Step 2: Delete from auth.users
      const success = await deleteUserFromAuth(supabase, uid);
      
      if (success) {
        deletedCount++;
        console.log(`   ✅ User ${uid} deleted successfully\n`);
      } else {
        failedCount++;
        console.log(`   ❌ Failed to delete user ${uid}\n`);
      }
    } catch (error: any) {
      failedCount++;
      console.error(`   ❌ Error processing user ${uid}: ${error.message}\n`);
    }
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════');
  console.log('   Deletion Summary');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Total users to delete: ${uidsToDelete.length}`);
  console.log(`Successfully deleted: ${deletedCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(console.error);

