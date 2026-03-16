#!/usr/bin/env node

/**
 * Enhanced LLM Usage Schema Validation
 * 
 * This script validates that the enhanced LLM usage tracking schema
 * has been applied correctly to the database.
 * 
 * Usage:
 *   node test/manual/validate-enhanced-schema.js
 */

const { createClient } = require('@supabase/supabase-js');

// Expected enhanced fields that should be present
const expectedFields = [
  // Data sanitization fields
  { name: 'data_sanitization_applied', type: 'boolean', nullable: true },
  { name: 'sanitization_level', type: 'character varying', nullable: true },
  { name: 'pii_detected', type: 'boolean', nullable: true },
  { name: 'pii_types', type: 'jsonb', nullable: true },
  { name: 'pseudonyms_used', type: 'integer', nullable: true },
  { name: 'pseudonym_types', type: 'jsonb', nullable: true },
  { name: 'redactions_applied', type: 'integer', nullable: true },
  { name: 'redaction_types', type: 'jsonb', nullable: true },
  
  // Source blinding fields
  { name: 'source_blinding_applied', type: 'boolean', nullable: true },
  { name: 'headers_stripped', type: 'integer', nullable: true },
  { name: 'custom_user_agent_used', type: 'boolean', nullable: true },
  { name: 'proxy_used', type: 'boolean', nullable: true },
  { name: 'no_train_header_sent', type: 'boolean', nullable: true },
  { name: 'no_retain_header_sent', type: 'boolean', nullable: true },
  
  // Performance fields
  { name: 'sanitization_time_ms', type: 'integer', nullable: true },
  { name: 'reversal_context_size', type: 'integer', nullable: true },
  
  // Policy fields
  { name: 'policy_profile', type: 'character varying', nullable: true },
  { name: 'sovereign_mode', type: 'boolean', nullable: true },
  
  // Compliance fields
  { name: 'compliance_flags', type: 'jsonb', nullable: true },
  
  // Additional metadata
  { name: 'langsmith_run_id', type: 'uuid', nullable: true },
  { name: 'total_cost', type: 'numeric', nullable: true },
];

async function validateSchema() {
  console.log('🔍 Enhanced LLM Usage Schema Validation');
  console.log('======================================\n');

  try {
    // Create Supabase client
    const supabaseUrl = process.env.SUPABASE_URL || 'https://jcmkjecmdugfzvdijodg.supabase.co';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    console.log('✅ Supabase client created');
    console.log(`📍 URL: ${supabaseUrl}`);

    // Get table schema information
    const { data: columns, error } = await supabase.rpc('exec_sql', {
      query: `
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'llm_usage'
        ORDER BY column_name
      `
    });

    if (error) {
      throw new Error(`Failed to query schema: ${error.message}`);
    }

    if (!columns || columns.length === 0) {
      throw new Error('No columns found for public.llm_usage table - table may not exist');
    }

    console.log(`📊 Found ${columns.length} columns in public.llm_usage table\n`);

    // Create a map of existing columns for easy lookup
    const existingColumns = new Map();
    columns.forEach(col => {
      existingColumns.set(col.column_name, {
        type: col.data_type,
        nullable: col.is_nullable === 'YES',
        default: col.column_default,
      });
    });

    console.log('🔍 Validating enhanced fields...\n');

    let missingFields = [];
    let typeErrors = [];
    let validFields = [];

    // Check each expected field
    expectedFields.forEach(expected => {
      const existing = existingColumns.get(expected.name);
      
      if (!existing) {
        missingFields.push(expected.name);
        console.log(`❌ Missing field: ${expected.name} (${expected.type})`);
      } else {
        // Check if types match (allow some flexibility for PostgreSQL type variations)
        const typeMatches = 
          existing.type === expected.type ||
          (expected.type === 'boolean' && existing.type === 'boolean') ||
          (expected.type === 'integer' && existing.type === 'integer') ||
          (expected.type === 'character varying' && existing.type.startsWith('character varying')) ||
          (expected.type === 'jsonb' && existing.type === 'jsonb') ||
          (expected.type === 'uuid' && existing.type === 'uuid') ||
          (expected.type === 'numeric' && existing.type.startsWith('numeric'));

        if (!typeMatches) {
          typeErrors.push({
            field: expected.name,
            expected: expected.type,
            actual: existing.type
          });
          console.log(`⚠️  Type mismatch: ${expected.name} - expected ${expected.type}, got ${existing.type}`);
        } else {
          validFields.push(expected.name);
          console.log(`✅ Valid field: ${expected.name} (${existing.type})`);
        }
      }
    });

    // Show summary
    console.log('\n📊 VALIDATION SUMMARY');
    console.log('====================');
    console.log(`✅ Valid fields: ${validFields.length}/${expectedFields.length}`);
    console.log(`❌ Missing fields: ${missingFields.length}`);
    console.log(`⚠️  Type mismatches: ${typeErrors.length}`);

    if (missingFields.length > 0) {
      console.log('\n❌ MISSING FIELDS:');
      missingFields.forEach(field => {
        const expected = expectedFields.find(f => f.name === field);
        console.log(`   • ${field} (${expected.type})`);
      });
      console.log('\n💡 To fix missing fields, run the migration:');
      console.log('   supabase db push --password <your-db-password>');
    }

    if (typeErrors.length > 0) {
      console.log('\n⚠️  TYPE MISMATCHES:');
      typeErrors.forEach(error => {
        console.log(`   • ${error.field}: expected ${error.expected}, got ${error.actual}`);
      });
    }

    // Test basic table operations
    console.log('\n🧪 Testing basic table operations...');

    try {
      // Try to insert a test record
      const testRecord = {
        run_id: 'test-schema-validation-' + Date.now(),
        provider_name: 'test',
        model_name: 'test',
        status: 'started',
        caller_type: 'schema-validation',
        caller_name: 'test',
        started_at: new Date().toISOString(),
        data_sanitization_applied: true,
        sanitization_level: 'standard',
        pii_detected: false,
        compliance_flags: JSON.stringify({ test: true }),
      };

      const { data: insertData, error: insertError } = await supabase
        .from('llm_usage')
        .insert([testRecord])
        .select();

      if (insertError) {
        console.log(`❌ Insert test failed: ${insertError.message}`);
      } else {
        console.log('✅ Insert test passed');

        // Clean up test record
        const { error: deleteError } = await supabase
          .from('llm_usage')
          .delete()
          .eq('run_id', testRecord.run_id);

        if (deleteError) {
          console.log(`⚠️  Cleanup warning: ${deleteError.message}`);
        } else {
          console.log('✅ Cleanup completed');
        }
      }
    } catch (testError) {
      console.log(`❌ Table operation test failed: ${testError.message}`);
    }

    // Final status
    const isValid = missingFields.length === 0 && typeErrors.length === 0;
    
    console.log(`\n${isValid ? '🎉' : '💥'} Schema validation ${isValid ? 'PASSED' : 'FAILED'}`);
    
    if (isValid) {
      console.log('\n🚀 Ready to run enhanced metrics tests:');
      console.log('   npm run test:manual:enhanced-metrics');
      console.log('   npm run test:e2e:enhanced-metrics');
    } else {
      console.log('\n🔧 Please fix schema issues before running enhanced metrics tests');
    }

    process.exit(isValid ? 0 : 1);

  } catch (error) {
    console.error('💥 Validation failed:', error.message);
    process.exit(1);
  }
}

// Handle CLI help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Enhanced LLM Usage Schema Validation');
  console.log('');
  console.log('Usage: node validate-enhanced-schema.js');
  console.log('');
  console.log('This script validates that all enhanced LLM usage tracking fields');
  console.log('have been added to the database schema correctly.');
  console.log('');
  console.log('Environment variables required:');
  console.log('• SUPABASE_URL');
  console.log('• SUPABASE_SERVICE_ROLE_KEY');
  console.log('');
  process.exit(0);
}

// Run the validation
validateSchema();