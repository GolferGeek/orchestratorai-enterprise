#!/usr/bin/env ts-node
/**
 * Find All Test Users Script
 * 
 * Lists all test users from auth.users (not just public.users) to get their UIDs
 * 
 * Usage:
 *   ts-node scripts/find-all-test-users.ts
 */

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

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Test user email patterns
const TEST_USER_PATTERNS = [
  /^test-.*@orchestratorai\.io$/i,
  /^test-golfer-.*@orchestratorai\.io$/i,
  /^.*-test@orchestratorai\.io$/i,
  /^test.*@orchestratorai\.io$/i,
  /^golfer@orchestratorai\.io$/i,
  /^duplicate-test@orchestratorai\.io$/i,
  /^weak-password@orchestratorai\.io$/i,
];

function isTestUser(email: string): boolean {
  return TEST_USER_PATTERNS.some(pattern => pattern.test(email));
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  console.log('🔍 Finding all test users in auth.users...\n');

  try {
    // List all users from auth (using admin API)
    // Note: Supabase admin API doesn't have a direct "list all users" endpoint
    // We need to use a workaround - query auth.users through SQL or use pagination
    
    // Try to get users - Supabase admin API requires pagination
    let page = 1;
    const perPage = 1000;
    const allUsers: Array<{ id: string; email: string }> = [];
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase.auth.admin.listUsers({
        page,
        perPage
      });

      if (error) {
        console.error('❌ Error fetching users:', error.message);
        break;
      }

      if (data && data.users) {
        allUsers.push(...data.users.map(u => ({ id: u.id, email: u.email || '' })));
        hasMore = data.users.length === perPage;
        page++;
      } else {
        hasMore = false;
      }
    }

    // Filter test users
    const testUsers = allUsers.filter(user => isTestUser(user.email));

    if (testUsers.length === 0) {
      console.log('✅ No test users found.\n');
      return;
    }

    console.log(`📋 Found ${testUsers.length} test user(s):\n`);
    testUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email}`);
      console.log(`   UID: ${user.id}\n`);
    });

    console.log('\n💡 To delete these users, run:');
    console.log(`   ts-node scripts/force-delete-test-users.ts ${testUsers.map(u => u.id).join(' ')}\n`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);

