#!/usr/bin/env node

require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { createClient } = require('@supabase/supabase-js');

async function fixAgentType() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
    console.error('   SUPABASE_URL:', supabaseUrl || 'not set');
    console.error('   SUPABASE_KEY:', supabaseKey ? 'set' : 'not set');
    process.exit(1);
  }

  // Use the service role key to bypass RLS
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('🔍 Checking current blog_post_writer agent...\n');

  // Check current state
  const { data: before, error: beforeError } = await supabase
    .from('agents')
    .select('id, slug, display_name, agent_type, organization_slug, status')
    .eq('slug', 'blog_post_writer')
    .single();

  if (beforeError) {
    console.error('❌ Error fetching agent:', beforeError.message);
    return;
  }

  if (!before) {
    console.log('❌ Agent not found in database');
    return;
  }

  console.log('Current state:');
  console.log(JSON.stringify(before, null, 2));
  console.log('');

  if (before.agent_type === 'context') {
    console.log('✅ Agent is already set to type "context" - no changes needed');
    return;
  }

  console.log(`🔧 Updating agent_type from "${before.agent_type}" to "context"...\n`);

  // Update the agent type
  const { data: updated, error: updateError } = await supabase
    .from('agents')
    .update({ agent_type: 'context' })
    .eq('slug', 'blog_post_writer')
    .select()
    .single();

  if (updateError) {
    console.error('❌ Error updating agent:', updateError.message);
    return;
  }

  console.log('✅ Successfully updated agent type!');
  console.log('\nNew state:');
  console.log(JSON.stringify(updated, null, 2));
}

fixAgentType().catch(console.error);

