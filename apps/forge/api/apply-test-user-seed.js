#!/usr/bin/env node
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

if (!process.env.DATABASE_URL && !process.env.PGPORT) {
  console.error('ERROR: DATABASE_URL or PGPORT environment variable is required');
  process.exit(1);
}

const client = new Client(
  process.env.DATABASE_URL || {
    host: process.env.PGHOST || '127.0.0.1',
    port: parseInt(process.env.PGPORT),
    database: process.env.PGDATABASE || 'postgres',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres'
  }
);

const seedFile = path.join(__dirname, 'supabase', 'seed', 'test-user.sql');

async function applySeed() {
  try {
    await client.connect();
    console.log('✅ Connected to Supabase database');

    const sql = fs.readFileSync(seedFile, 'utf8');
    console.log(`📄 Applying seed file: ${seedFile}`);
    console.log(`📊 File size: ${(sql.length / 1024).toFixed(2)} KB`);

    await client.query(sql);
    console.log('✅ Test user seed file applied successfully');
    console.log('');
    console.log('📧 Email: demo.user@orchestratorai.io');
    console.log('🔑 Password: DemoUser123!');
    console.log('🏢 Organization: demo-org');
    console.log('');

  } catch (err) {
    console.error('❌ Error applying seed file:', err.message);
    console.error('Full error:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applySeed();
