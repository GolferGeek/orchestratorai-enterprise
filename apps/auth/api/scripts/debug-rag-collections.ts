#!/usr/bin/env tsx

/**
 * Debug script for RAG collections visibility issue
 * Run: cd apps/api && npx tsx scripts/debug-rag-collections.ts
 */

import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function debugRagCollections() {
  try {
    console.log('🔍 Debugging RAG Collections Issue for GolferGeek\n');
    console.log('=' .repeat(80));

    // 1. Check what collections exist
    console.log('\n1️⃣  ALL RAG COLLECTIONS IN DATABASE:');
    console.log('-'.repeat(80));
    const allCollections = await pool.query(`
      SELECT
        id,
        name,
        organization_slug,
        created_by,
        allowed_users,
        status,
        document_count,
        chunk_count
      FROM rag_data.rag_collections
      ORDER BY created_at DESC;
    `);

    if (allCollections.rows.length === 0) {
      console.log('❌ NO COLLECTIONS FOUND IN DATABASE!\n');
    } else {
      console.table(allCollections.rows);
      console.log(`\n✅ Found ${allCollections.rows.length} collection(s)\n`);
    }

    // 2. Check GolferGeek's user ID
    console.log('\n2️⃣  GOLFERGEEK USER INFO:');
    console.log('-'.repeat(80));
    const userInfo = await pool.query(`
      SELECT id, email FROM auth.users WHERE email = 'golfergeek@orchestratorai.io';
    `);

    if (userInfo.rows.length > 0) {
      console.table(userInfo.rows);
      const userId = userInfo.rows[0].id;
      console.log(`\n✅ GolferGeek User ID: ${userId}\n`);

      // 3. Test the rag_get_collections function with GolferGeek's user ID
      console.log('\n3️⃣  TEST rag_get_collections WITH GOLFERGEEK USER ID:');
      console.log('-'.repeat(80));
      const withUserId = await pool.query(`
        SELECT * FROM rag_data.rag_get_collections('demo-org', $1::uuid);
      `, [userId]);

      if (withUserId.rows.length === 0) {
        console.log('❌ NO COLLECTIONS RETURNED when filtering by user!\n');
        console.log('This means collections are filtered out due to access control.\n');
      } else {
        console.table(withUserId.rows.map(r => ({
          id: r.id,
          name: r.name,
          org: r.organization_slug,
          status: r.status,
          docs: r.document_count,
          chunks: r.chunk_count
        })));
        console.log(`\n✅ Found ${withUserId.rows.length} collection(s) for GolferGeek\n`);
      }

      // 4. Test without user filter (admin mode)
      console.log('\n4️⃣  TEST rag_get_collections WITHOUT USER FILTER (ADMIN MODE):');
      console.log('-'.repeat(80));
      const withoutUserId = await pool.query(`
        SELECT * FROM rag_data.rag_get_collections('demo-org', NULL::uuid);
      `);

      if (withoutUserId.rows.length === 0) {
        console.log('❌ NO COLLECTIONS RETURNED even in admin mode!\n');
      } else {
        console.table(withoutUserId.rows.map(r => ({
          id: r.id,
          name: r.name,
          org: r.organization_slug,
          status: r.status,
          docs: r.document_count,
          chunks: r.chunk_count
        })));
        console.log(`\n✅ Found ${withoutUserId.rows.length} collection(s) in admin mode\n`);
      }

      // 5. Check access control details
      if (allCollections.rows.length > 0) {
        console.log('\n5️⃣  ACCESS CONTROL ANALYSIS:');
        console.log('-'.repeat(80));
        allCollections.rows.forEach((collection, idx) => {
          console.log(`\nCollection ${idx + 1}: "${collection.name}"`);
          console.log(`  - Organization: ${collection.organization_slug}`);
          console.log(`  - Created By: ${collection.created_by || 'NULL'}`);
          console.log(`  - Allowed Users: ${collection.allowed_users ? JSON.stringify(collection.allowed_users) : 'NULL (public)'}`);

          // Check if GolferGeek should have access
          const isPublic = collection.allowed_users === null;
          const isCreator = collection.created_by === userId;
          const isInAllowedList = collection.allowed_users && collection.allowed_users.includes(userId);

          console.log(`  - Access for GolferGeek:`);
          console.log(`    • Public? ${isPublic ? '✅' : '❌'}`);
          console.log(`    • Creator? ${isCreator ? '✅' : '❌'}`);
          console.log(`    • In allowed list? ${isInAllowedList ? '✅' : '❌'}`);

          if (!isPublic && !isCreator && !isInAllowedList) {
            console.log(`    ⚠️  NO ACCESS - This is why collection is filtered out!`);
          } else {
            console.log(`    ✅ HAS ACCESS`);
          }
        });
      }

    } else {
      console.log('❌ GolferGeek user not found in database!\n');
    }

    // 6. Check organization
    console.log('\n6️⃣  ORGANIZATION CHECK:');
    console.log('-'.repeat(80));
    const orgCheck = await pool.query(`
      SELECT slug, name FROM public.organizations WHERE slug = 'demo-org';
    `);

    if (orgCheck.rows.length > 0) {
      console.table(orgCheck.rows);
      console.log('\n✅ demo-org organization exists\n');
    } else {
      console.log('❌ demo-org organization NOT FOUND!\n');
    }

    // 7. Summary and recommendations
    console.log('\n7️⃣  SUMMARY & RECOMMENDATIONS:');
    console.log('='.repeat(80));

    if (allCollections.rows.length === 0) {
      console.log('\n🔴 ROOT CAUSE: No collections exist in the database at all!');
      console.log('\n📝 RECOMMENDATION: Create a new collection first.');
    } else if (withUserId && withUserId.rows.length === 0) {
      console.log('\n🔴 ROOT CAUSE: Collections exist but are filtered by access control.');
      console.log('\n📝 RECOMMENDATIONS:');
      console.log('   1. Make collections public by setting allowed_users to NULL');
      console.log('   2. Add GolferGeek to the allowed_users array');
      console.log('   3. Pass NULL as user_id to bypass filtering (admin mode)');
    } else {
      console.log('\n🟢 Collections are accessible! The issue might be elsewhere.');
      console.log('\n📝 CHECK:');
      console.log('   1. Frontend is using correct organization slug');
      console.log('   2. API is properly passing user ID');
      console.log('   3. Browser console for any API errors');
    }

    console.log('\n' + '='.repeat(80));

  } catch (error) {
    console.error('❌ ERROR:', error);
  } finally {
    await pool.end();
  }
}

debugRagCollections();
