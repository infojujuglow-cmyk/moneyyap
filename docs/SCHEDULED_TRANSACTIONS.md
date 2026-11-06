# Scheduled transactions

Scheduled templates and occurrences are separate from the transaction ledger. An occurrence changes account balances, actual reports, and actual budget spending only after it is recorded. Internal transfers and card payments are account movements, not new income or expenses.

## Deployment

1. Enable Supabase Cron (`pg_cron`) for the project if it is not already available.
2. Apply `supabase/migrations/20261106193056_scheduled_transactions.sql` to the target database. The migration creates the tables, RLS policies, recording functions, and a 15-minute Cron job.
3. Deploy the web app and an Expo update/build for the mobile apps using the repository's usual release process. The client UI expects the migration to be present.
4. Verify a manual one-time schedule, a recurring schedule, reminders, and an opt-in auto-record schedule against a test workspace before enabling auto-record for real entries.

The Cron job runs on the server even if no client is open. Auto-record creates an entry **inside MoneyYap only**. It does not send money, pay a bank, or confirm an external payment. The database uses row locks and unique occurrence/transaction links to prevent duplicate ledger entries on retries.

Reminders are persistent and visible in the Scheduled screen. Push delivery is not configured in the existing app; adding it later requires a push-token registration flow and a server-side delivery worker. The in-app reminder records are unique for each user, occurrence, and threshold.

## Verification

Run `npm test`, `npm run typecheck`, and `npm run lint -- --quiet`. Test Web, iOS, and Android bundles with `npx expo export --platform web`, `--platform ios`, and `--platform android`. Database behavior, including Cron, RLS, and concurrent recording, must be verified against a Supabase test project after applying the migration.
