import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Parse .env from frontend to get SUPABASE URL and KEY
const envPath = path.join(process.cwd(), '../frontend/.env');
const envContent = fs.readFileSync(envPath, 'utf8');

let supabaseUrl = '';
let supabaseKey = '';

envContent.split('\n').forEach(line => {
  if (line.startsWith('VITE_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim();
  if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) supabaseKey = line.split('=')[1].trim();
});

if (!supabaseUrl || !supabaseKey) {
  console.error("Could not find Supabase credentials in frontend/.env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const sqlFile = path.join(process.cwd(), 'MIGRATION_GST_INVOICING.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');
  
  console.log("Applying Migration...");
  
  // Try to use a custom rpc or REST api if available, otherwise just warn user to run manually if it fails
  // Let's try rpc 'exec_sql' if it exists
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  
  if (error) {
    console.error("Failed to run via RPC (expected if exec_sql doesn't exist). Error:", error.message);
    console.log("Please run MIGRATION_GST_INVOICING.sql manually in the Supabase SQL Editor.");
  } else {
    console.log("Migration applied successfully via RPC.");
  }
}

run();
