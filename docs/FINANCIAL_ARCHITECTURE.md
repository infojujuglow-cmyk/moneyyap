# Financial Architecture

## Record ownership

MoneyYap owns accounts, transactions, categories, budgets, obligations, capital classifications, project cost allocations, attachments, corrections, and financial history. Venture OS consumes read-only financial intelligence and keeps only mappings, derived snapshots, freshness metadata, targets, alerts, and approved project budgets.

Operational applications continue to own orders, inventory, procurement, subscription activity, and operational metrics. An operational record becomes financial only when MoneyYap records the corresponding cash movement or obligation.

## Tenant model

- A MoneyYap workspace is the authorization boundary.
- A Space is classified as `personal`, `household`, or `business`.
- Existing Spaces migrate as `household` and cannot be exported.
- Only active Business Spaces may be explicitly attached to an integration connection.
- Private-owner accounts and transactions touching them are excluded from integration results.
- A Business Space may optionally reference a legal entity. The relationship is never inferred.

## Accounting basis

The integration reports cash-basis operating income, operating expense, and operating result. Internal transfers and card payments are excluded. Refunds reduce operating expense. Owner capital, owner withdrawals, owner loans, and loan repayments affect cash but remain outside operating results.

Money uses PostgreSQL `numeric(16,2)`. JavaScript calculations convert API values only for aggregation/display; the source ledger remains decimal-safe in PostgreSQL.

## Project model

MoneyYap stores a minimal external project reference containing the Venture OS business ID, project ID, and display name. It does not copy the Venture OS project database. Transaction allocations can split one expense across several validated project references, and their sum cannot exceed the transaction amount.

## Corrections

API responses are calculated from current MoneyYap records. Reclassification, refund, deletion, or changed project allocation is reflected on the next synchronization. Venture OS must treat the latest snapshot as a replacement for the same mapping, metric, basis, and period.
