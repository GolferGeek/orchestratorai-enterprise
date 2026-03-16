import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from the root .env file
const envPath = path.resolve(__dirname, '../../../.env');
dotenv.config({ path: envPath });

async function checkRiskSchema() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // Using service role to bypass RLS

  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return;
  }

  const supabase = createClient(url, key);

  console.log(`Checking risk schema at ${url}...`);

  // Try to query the 'risk.scopes' table
  const { data, error } = await supabase
    .schema('risk')
    .from('scopes')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error querying risk.scopes:', error);
    if (error.message.includes('Invalid schema')) {
        console.error('CONFIRMED: The "risk" schema is missing or not exposed to PostgREST.');
    }
  } else {
    console.log('Successfully queried risk.scopes. The schema exists and is accessible.');
    console.log('Data:', data);
  }
}

checkRiskSchema();
