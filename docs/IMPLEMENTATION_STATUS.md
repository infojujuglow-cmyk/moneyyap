# Implementation Status

## Implemented in MoneyYap

- Business, Household, and Personal Space classification with no automatic business exposure
- Business description, currency, and optional legal-entity reference
- Capital transaction classification separated from operating reporting and budgets
- Separate receivable/payable records with partial settlement links and outstanding balances
- External Venture OS project references and split transaction/project allocations
- Monthly project budget allocations
- Explicit Venture OS Space consent, hashed credentials, rotation, revocation, scopes, last access, and access logs
- Versioned read-only Edge API for health, Spaces, summaries, accounts, budgets, cash flow, obligations, project costs, and standardized metrics
- Private-owner account exclusion and completeness indicators
- MoneyYap integration-management UI for web and Expo

## Verified locally

- PostgreSQL 15 migration execution
- TypeScript typecheck
- Expo lint
- Financial aggregation and architecture tests
- Web, iOS, and Android bundle export (required before deployment)

## Deployed boundary

- Additive financial integration migration applied to the linked MoneyYap Supabase project
- `integration-api` Edge Function deployed with gateway JWT verification disabled and custom hashed service-token authentication enabled
- Live unauthenticated `GET /health` returns the documented `401`; live write requests return `405`
- No existing Space was automatically reclassified or shared
- The live workspace currently has no Business Space and no integration connection, so authorized MoneyYap-to-Venture communication remains pending explicit user consent and credential configuration

## Venture OS boundary

Venture OS is expected to store business/Space mappings, derived snapshots, sync status, project approved budgets, and alerts. It must not create or edit MoneyYap ledger transactions. Existing Venture OS financial records must remain preserved until explicitly reconciled with the selected source of record.

## Deployment requirements

1. Create or reclassify the intended Space as Business and authorize it in MoneyYap.
2. Store the one-time credential in a Venture OS server environment variable.
3. Configure the deployed Edge Function URL and the documented versioned paths in Venture OS.
4. Verify real authenticated `/health`, `/spaces`, and `/metrics` communication before marking the mapping connected.

No integration is considered connected merely because configuration was saved.
