/**
 * clean_init.js — Strip all Supabase artifacts from init.sql
 * 
 * Run from project root: node scratch/clean_init.js
 */
const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, '..', 'database', 'init.sql');
const outputFile = path.join(__dirname, '..', 'database', 'init.sql');

console.log('Reading init.sql...');
const content = fs.readFileSync(inputFile, 'utf8');
const lines = content.split('\n');
console.log(`Input: ${lines.length} lines, ${content.length} bytes`);

const outputLines = [];
let i = 0;
const removed = {
  restrict: 0, roles: 0, grants: 0, defaultPrivs: 0,
  rls: 0, policies: 0, commentBlocks: 0, dropPolicy: 0
};

while (i < lines.length) {
  const line = lines[i];
  const trimmed = line.replace(/\r$/, '').trim();

  // ─── 1. Remove \restrict / \unrestrict ───
  if (trimmed.startsWith('\\restrict') || trimmed.startsWith('\\unrestrict')) {
    removed.restrict++;
    i++;
    continue;
  }

  // ─── 2. Remove supabase role creation ───
  if (/^CREATE\s+ROLE\s+(anon|authenticated|service_role)\s+NOLOGIN\s*;$/i.test(trimmed)) {
    removed.roles++;
    i++;
    continue;
  }

  // ─── 3. Remove GRANT ... TO anon/authenticated/service_role ───
  if (/^GRANT\s+.*\s+TO\s+(anon|authenticated|service_role)\s*;$/i.test(trimmed)) {
    removed.grants++;
    i++;
    continue;
  }

  // ─── 4. Remove ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin ───
  if (/^ALTER\s+DEFAULT\s+PRIVILEGES\s+FOR\s+ROLE\s+supabase_admin/i.test(trimmed)) {
    removed.defaultPrivs++;
    i++;
    continue;
  }

  // ─── 5. Remove ENABLE ROW LEVEL SECURITY ───
  if (/ALTER\s+TABLE\s+.*\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\s*;$/i.test(trimmed)) {
    removed.rls++;
    i++;
    continue;
  }

  // ─── 6. Remove DROP POLICY (single or multi-line) ───
  if (/^DROP\s+POLICY/i.test(trimmed)) {
    removed.dropPolicy++;
    // Skip until line ends with ;
    while (i < lines.length && !lines[i].replace(/\r$/, '').trim().endsWith(';')) {
      i++;
    }
    i++; // skip the closing ; line
    continue;
  }

  // ─── 7. Remove CREATE POLICY (multi-line) ───
  if (/^CREATE\s+POLICY/i.test(trimmed)) {
    removed.policies++;
    // Skip until line ends with ;
    while (i < lines.length) {
      const cur = lines[i].replace(/\r$/, '').trim();
      i++;
      if (cur.endsWith(';')) break;
    }
    continue;
  }

  // ─── 8. Remove comment blocks for ACL/POLICY/ROW SECURITY/DEFAULT ACL ───
  if (trimmed === '--' && i + 2 < lines.length) {
    const nextTrimmed = lines[i + 1].replace(/\r$/, '').trim();
    const afterTrimmed = lines[i + 2].replace(/\r$/, '').trim();
    if (afterTrimmed === '--' &&
      /^--\s*Name:.*;\s*Type:\s*(ACL|DEFAULT\s+ACL|POLICY|ROW\s+SECURITY)/i.test(nextTrimmed)) {
      removed.commentBlocks++;
      i += 3;
      // Also skip trailing blank lines
      while (i < lines.length && lines[i].replace(/\r$/, '').trim() === '') {
        i++;
      }
      continue;
    }
  }

  // ════════ TRANSFORMATIONS ════════

  let out = line;

  // ─── 9. Fix pg_database_owner → postgres ───
  if (out.includes('pg_database_owner')) {
    out = out.replace(/pg_database_owner/g, 'postgres');
  }

  // ─── 10. CREATE FUNCTION → CREATE OR REPLACE FUNCTION ───
  if (/^\s*CREATE\s+FUNCTION\s/i.test(out) && !/CREATE\s+OR\s+REPLACE\s+FUNCTION/i.test(out)) {
    out = out.replace(/CREATE\s+FUNCTION/i, 'CREATE OR REPLACE FUNCTION');
  }

  outputLines.push(out);
  i++;
}

// ─── Collapse excessive blank lines (max 2 consecutive) ───
const finalLines = [];
let blankCount = 0;
for (const line of outputLines) {
  const t = line.replace(/\r$/, '').trim();
  if (t === '') {
    blankCount++;
    if (blankCount <= 2) finalLines.push(line);
  } else {
    blankCount = 0;
    finalLines.push(line);
  }
}

// ─── Write output ───
fs.writeFileSync(outputFile, finalLines.join('\n'), 'utf8');

console.log(`\nOutput: ${finalLines.length} lines (removed ${lines.length - finalLines.length} lines)`);
console.log('\nRemoval breakdown:');
console.log(`  \\restrict/\\unrestrict:    ${removed.restrict}`);
console.log(`  Supabase role creation:   ${removed.roles}`);
console.log(`  GRANT statements:         ${removed.grants}`);
console.log(`  DEFAULT PRIVILEGES:       ${removed.defaultPrivs}`);
console.log(`  ROW LEVEL SECURITY:       ${removed.rls}`);
console.log(`  DROP POLICY:              ${removed.dropPolicy}`);
console.log(`  CREATE POLICY:            ${removed.policies}`);
console.log(`  Comment blocks removed:   ${removed.commentBlocks}`);
console.log('\n✅ init.sql has been cleaned of all Supabase artifacts.');
