# MoneyYap Integration API

## Base URL and authentication

The deployed Supabase Edge Function base is:

`https://<project-ref>.supabase.co/functions/v1/integration-api/api/integrations/v1`

Every request requires `Authorization: Bearer <MoneyYap service credential>`. The credential is generated once in **Settings → Business integrations**, stored only as a SHA-256 hash by MoneyYap, and must be kept in a Venture OS server environment variable. Browser code must never receive it.

## Endpoints

- `GET /health`
- `GET /spaces`
- `GET /spaces/{spaceId}/summary?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /spaces/{spaceId}/accounts?from=...&to=...`
- `GET /spaces/{spaceId}/budgets?from=...&to=...`
- `GET /spaces/{spaceId}/cashflow?from=...&to=...`
- `GET /spaces/{spaceId}/obligations?from=...&to=...`
- `GET /spaces/{spaceId}/project-costs?from=...&to=...`
- `GET /spaces/{spaceId}/metrics?from=...&to=...`

Date ranges default to the current calendar month and cannot exceed 366 days. All other HTTP methods return `405` because the contract is read-only.

Account and cash-balance values are calculated as of the requested `to` date. Transactions after that cutoff are reversed from the current ledger balance. Private-owner accounts remain excluded.

## Response metadata

Financial responses include:

```json
{
  "metadata": {
    "currency": "PHP",
    "reporting_basis": "cash",
    "source_updated_at": "2026-11-01T00:00:00Z",
    "generated_at": "2026-11-01T00:01:00Z",
    "range": { "from": "2026-11-01", "to": "2026-11-30" },
    "data_completeness": {
      "status": "complete",
      "private_accounts_excluded": 0,
      "private_account_transactions_excluded": 0
    }
  }
}
```

Errors use `{ "error": { "code", "message", "request_id" } }` with HTTP `400`, `401`, `403`, `404`, `405`, or `500`.

## Authorization workflow

1. A MoneyYap owner/admin changes the intended Space type to Business.
2. The owner/admin selects only the Business Spaces Venture OS may read.
3. MoneyYap returns a credential once.
4. A Venture OS administrator saves the credential in a server environment variable and maps one local business to the authorized Space ID.
5. Venture OS calls `/health` and `/spaces`, verifies that the configured Space is authorized, then enables synchronization.
6. Revocation in MoneyYap invalidates the credential immediately.

The API never returns personal/household Spaces, private-owner accounts, raw credentials, account numbers, or transaction notes.
