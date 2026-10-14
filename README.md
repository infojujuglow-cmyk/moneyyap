# MoneyYap

**Money conversations, made simple.**  
Just talk. We track.

MoneyYap is an AI-first personal finance app for iOS, Android, and MacBook browsers, built with Expo, React Native, TypeScript, Expo Router, Supabase, and a secure server-side OpenAI parser.

## What is implemented

- Email/password authentication and workspace onboarding
- Custom Spaces for flexible life, project, and business organization
- Shared or Space-specific categories with one level of subcategories
- Optional tags, classification rules, and transaction-split foundations
- Reversible account removal that preserves transaction history
- Workspace-scoped accounts, members, categories, and transactions
- Conversational transaction entry in English, Tagalog, and Taglish
- Receipt, bank/e-wallet screenshot, and statement-image analysis with local compression and mandatory review before save
- Multiple-transaction extraction, source evidence, account/Space clarification, and possible-duplicate warnings
- Secure Edge Functions for production text and image transaction parsing
- High-confidence auto-save with Undo/Edit; ambiguity prompts for the missing detail
- Manual transaction entry, editing, and deletion
- Search plus date, account, category, and transaction-type filters
- Dashboard and analytics calculated from transaction data
- Responsive MacBook layout with persistent sidebar navigation, a two-column dashboard, wide transaction table, and expanded analytics
- Account assets and credit-card liabilities with transfer-safe balance math
- Complete RLS policies and referential validation triggers

## Project structure

```text
app/
  (auth)/              authentication and workspace setup
  (tabs)/              Home, Transactions, Talk, Analytics, Settings
  transaction/[id].tsx edit/delete transaction modal
  account/[id].tsx     remove/restore account and preserved history
  space/[id].tsx       create/edit/archive Space
  category/[id].tsx    create/edit/archive category
  accounts.tsx         account overview
  add-account.tsx      account creation
  manual-transaction.tsx
src/
  components/          branded primitives, rows, composer, cards, charts
  context/             auth and finance state boundaries
  lib/supabase.ts      environment-aware Supabase client
  services/            analytics, parsing, Supabase mapping
  theme/               MoneyYap tokens and formatting
  types/               typed finance domain
supabase/
  migrations/          schema, constraints, RLS, balance view, seed categories
  functions/           authenticated OpenAI text and image transaction parsers
scripts/               reproducible branded app-icon generation
```

## Architecture decisions

- The tenant boundary is `workspace_id`; no user, required Space name, or workspace is hardcoded in production data.
- Every transaction belongs to exactly one `space_id`. Accounts may optionally prefer a Space, while categories are shared or Space-specific.
- Transaction type, Space, category/subcategory, tags, account, merchant, and member are separate classification dimensions.
- RLS checks membership in PostgreSQL. Client-side filtering is only a UX concern, never a security boundary.
- Transaction amounts are positive. Direction is expressed through `account_from_id` and `account_to_id`.
- Only `expense` rows count toward spending. Transfers and card payments move balances but do not inflate analytics.
- The Edge Function uses the caller's JWT and RLS to load context. It has no direct mutation tool and returns a validated draft only.
- OpenAI output is strict JSON Schema, then checked again against real workspace, Space, account, category, tag, and member IDs.
- Supabase is required at runtime. The app starts with an empty state until an authenticated workspace is loaded.

## Run locally

Requirements: Node.js and npm. Native iOS/Android development also requires Expo-compatible tooling.

```bash
npm install
cp .env.example .env
npm start
```

Fill both public Supabase variables before running the app. Then use `npm run web` for the MacBook browser version, or `npm run ios` / `npm run android` for mobile development.

## MacBook layout

The existing Expo web app becomes a desktop workspace at browser widths of 1024 px and above. It keeps the same authenticated Supabase data and transaction flows as mobile. The desktop layout adds a persistent sidebar for Overview, Transactions, Talk, Analytics, Accounts, Spaces, Categories, Members, workspace switching, and Settings. Overview and Analytics use multiple columns; Transactions shows category, account, Space, date, and amount columns. Narrow browser windows retain the mobile tab layout. This is a browser-based desktop version; it is not packaged as a native macOS app.

## Connect Supabase

1. Create a Supabase project.
2. Copy `.env.example` to `.env` and fill only the public project URL and anon key.
3. Apply both migrations in timestamp order with `supabase db push` (or your normal Supabase migration workflow).
4. Configure Edge Function secrets:

```bash
supabase secrets set OPENAI_API_KEY=... OPENAI_MODEL=...
supabase functions deploy parse-transaction
supabase functions deploy parse-transaction-image
```

`OPENAI_VISION_MODEL` is optional and falls back to `OPENAI_MODEL`; set it separately only if you want a different image-capable model. Screenshots are resized and compressed on-device, sent only to the authenticated Edge Function for analysis, and are never inserted into MoneyYap storage. Image-derived drafts are never auto-saved.

`OPENAI_API_KEY` and any service-role key must never use the `EXPO_PUBLIC_` prefix or appear in the mobile environment.

## Verification

```bash
npm run typecheck
npx expo-doctor
npx expo export --platform web
```

The generated app icons come from `scripts/generate-assets.mjs`; run `node scripts/generate-assets.mjs` after editing the vector mark.

## Over-the-air updates

The iOS preview build receives JavaScript, styling, and asset changes through EAS Update. Create one new OTA-capable build after changing native dependencies or this configuration:

```bash
npx eas build --platform ios --profile preview
```

For later app-only changes, publish to the same preview channel instead of rebuilding:

```bash
npx eas update --channel preview --environment preview --message "Describe the change"
```

Force-close and reopen the installed app twice to download and apply the update. Make a new build (and increment `expo.version`) when changing native modules, iOS permissions, app configuration, or the Expo SDK.
