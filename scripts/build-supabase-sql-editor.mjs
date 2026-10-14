import { mkdir, readFile, writeFile } from 'node:fs/promises';

const migrationFiles = [
  'supabase/migrations/202608110001_initial_moneyyap.sql',
  'supabase/migrations/202608120001_spaces_and_classification.sql',
  'supabase/migrations/202608160001_workspace_member_invites.sql',
  'supabase/migrations/202608200001_ownership_aware_classification.sql',
  'supabase/migrations/202608200002_conversational_finance.sql',
];

const header = `-- MoneyYap — Fresh Supabase Project Setup
--
-- Run this entire file once in Supabase Dashboard → SQL Editor.
-- It is for a blank Supabase project only; do not run it again after it succeeds.
-- It creates the production schema, RLS policies, auth profile trigger,
-- workspace onboarding function, Spaces, categories, accounts, tags, and transaction rules.
-- It does NOT insert Carlo/Acee, demo accounts, or sample transactions.

`;

const sections = await Promise.all(migrationFiles.map(async (file) => ({
  file,
  sql: await readFile(file, 'utf8'),
})));

const compiled = header + sections
  .map(({ file, sql }, index) => `-- ============================================================================\n-- Migration ${index + 1}: ${file}\n-- ============================================================================\n\n${sql.trim()}\n`)
  .join('\n');

const classificationSql = sections[1].sql;
const resumeStart = classificationSql.indexOf('create or replace function public.is_workspace_member');
if (resumeStart < 0) throw new Error('Could not locate the resume point in the classification migration.');
const resume = `-- MoneyYap — Resume setup after the legacy function-name error\n-- Run this only if inspect-moneyyap-setup-state.sql says RESUME.\n-- It completes Migration 2 after tables and function names were already renamed.\n\n${classificationSql.slice(resumeStart).trim()}\n`;

await mkdir('supabase/sql-editor', { recursive: true });
await writeFile('supabase/sql-editor/moneyyap-fresh-project-setup.sql', compiled);
await writeFile('supabase/sql-editor/moneyyap-resume-after-function-name-fix.sql', resume);
await writeFile('supabase/sql-editor/ownership-aware-classification-upgrade.sql', `-- MoneyYap — Ownership-aware transaction classification upgrade\n-- Run this once in Supabase Dashboard → SQL Editor on the existing project.\n\n${sections[3].sql.trim()}\n`);
await writeFile('supabase/sql-editor/conversational-finance-upgrade.sql', `-- MoneyYap — Conversational finance architecture upgrade\n-- Run this once in Supabase Dashboard → SQL Editor on the existing project.\n\n${sections[4].sql.trim()}\n`);
