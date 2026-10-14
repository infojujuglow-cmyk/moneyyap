const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/**', 'supabase/functions/**', 'supabase/sql-editor/**'] },
]);

