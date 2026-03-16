#!/usr/bin/env node

/**
 * Populates the blog-post-writer agent with plan/deliverable/io schemas so Phase 1 tests
 * can run against a fully configured Context agent.
 *
 * Usage:
 *   node apps/api/testing/configure-blog-post-writer-schemas.js
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY with elevated policy)
 * in the project root .env file.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { createClient } = require('@supabase/supabase-js');

const PLAN_STRUCTURE = {
  type: 'object',
  required: ['sections', 'target_audience', 'keywords'],
  properties: {
    sections: {
      type: 'array',
      minItems: 3,
      items: {
        type: 'object',
        required: ['title', 'key_points'],
        properties: {
          title: { type: 'string', minLength: 1 },
          key_points: {
            type: 'array',
            minItems: 2,
            items: { type: 'string' },
          },
        },
      },
    },
    target_audience: { type: 'string', minLength: 1 },
    keywords: {
      type: 'array',
      minItems: 3,
      items: { type: 'string' },
    },
    tone: {
      type: 'string',
      enum: ['professional', 'casual', 'technical'],
    },
  },
};

const DELIVERABLE_STRUCTURE = {
  type: 'object',
  required: ['introduction', 'body', 'conclusion'],
  properties: {
    introduction: {
      type: 'object',
      required: ['hook', 'thesis'],
      properties: {
        hook: { type: 'string', minLength: 50 },
        thesis: { type: 'string', minLength: 50 },
      },
    },
    body: {
      type: 'array',
      minItems: 3,
      items: {
        type: 'object',
        required: ['section_title', 'paragraphs'],
        properties: {
          section_title: { type: 'string' },
          paragraphs: {
            type: 'array',
            minItems: 2,
            items: { type: 'string', minLength: 100 },
          },
        },
      },
    },
    conclusion: {
      type: 'object',
      required: ['summary', 'call_to_action'],
      properties: {
        summary: { type: 'string', minLength: 50 },
        call_to_action: { type: 'string', minLength: 20 },
      },
    },
  },
};

const IO_SCHEMA = {
  input: {
    type: 'object',
    properties: {
      topic: { type: 'string' },
      length: { type: 'number', minimum: 500 },
    },
  },
  output: {
    type: 'object',
    required: ['content', 'metadata'],
    properties: {
      content: {
        type: 'string',
        minLength: 500,
        description: 'The complete blog post in markdown or HTML',
      },
      metadata: {
        type: 'object',
        required: ['word_count', 'reading_time'],
        properties: {
          word_count: { type: 'number', minimum: 500 },
          reading_time: { type: 'number', minimum: 2 },
          keywords_used: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
  },
};

async function configureAgentSchemas() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY in .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const candidateSlugs = ['blog-post-writer', 'blog_post_writer'];
  let agentRecord = null;

  for (const slug of candidateSlugs) {
    const { data, error } = await supabase
      .from('agents')
      .select('id, slug, display_name, plan_structure, deliverable_structure, io_schema')
      .eq('slug', slug)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error(`❌ Error fetching agent "${slug}":`, error.message);
      process.exit(1);
    }

    if (data) {
      agentRecord = data;
      break;
    }
  }

  if (!agentRecord) {
    console.error('❌ Could not find blog-post-writer agent (checked "blog-post-writer" and "blog_post_writer")');
    process.exit(1);
  }

  console.log('🔍 Current blog-post-writer configuration:\n');
  console.log(JSON.stringify(agentRecord, null, 2));
  console.log('');

  const { data: updatedAgent, error: updateError } = await supabase
    .from('agents')
    .update({
      plan_structure: PLAN_STRUCTURE,
      deliverable_structure: DELIVERABLE_STRUCTURE,
      io_schema: IO_SCHEMA,
    })
    .eq('id', agentRecord.id)
    .select('id, slug, plan_structure, deliverable_structure, io_schema')
    .single();

  if (updateError) {
    console.error('❌ Failed to update agent schemas:', updateError.message);
    process.exit(1);
  }

  console.log('✅ Successfully updated blog-post-writer schemas!\n');
  console.log(JSON.stringify(updatedAgent, null, 2));

  if (updatedAgent.plan_structure && updatedAgent.deliverable_structure && updatedAgent.io_schema) {
    console.log('\n🎉 All schema fields are now populated. Phase 1 tests can proceed.');
  } else {
    console.warn('\n⚠️ One or more schema fields are still null. Please verify manually.');
  }
}

configureAgentSchemas().catch((error) => {
  console.error('❌ Unexpected error configuring agent schemas:', error);
  process.exit(1);
});
