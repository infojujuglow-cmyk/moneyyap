# MoneyYap SQL Editor setup

Use this only for a new, empty Supabase project.

1. Open Supabase Dashboard → **SQL Editor** → **New query**.
2. Open `moneyyap-fresh-project-setup.sql` in this folder, copy everything, and paste it into the query.
3. Select **Run** once. Do not run the script a second time.
4. Confirm that the query succeeds, then create your MoneyYap account in the app. The signup trigger creates your profile; workspace setup creates your first Space and default categories.

The setup has no fake user, demo account, or sample transaction inserts. Default category templates are created only inside a real user's new workspace.

## If the first run stopped on error `42P13`

Run `inspect-moneyyap-setup-state.sql` first.

- If it returns **RESUME**, run `moneyyap-resume-after-function-name-fix.sql` once. Do not rerun the full setup file.
- If it returns **FRESH**, run the updated `moneyyap-fresh-project-setup.sql` once.

After the schema is live, deploy the two Edge Functions separately for conversational and image transaction analysis. They cannot be deployed through Supabase SQL Editor.

## Existing MoneyYap project upgrades

For the intent-first chat architecture, run `conversational-finance-upgrade.sql` once. It adds only conversation persistence and structured query-context tables; it does not modify or delete existing accounts, balances, or transactions.
