# Integration Security

- Connections require explicit owner/admin consent and an allow-list of Business Space IDs.
- Personal and Household Spaces fail authorization at the database trigger and API layers.
- Credentials contain 256 bits of randomness and are stored only as SHA-256 hashes.
- Credential rotation invalidates the previous key; revocation is immediate.
- Scopes are allow-listed and default to read-only summaries/project costs.
- The Edge Function uses the service role only on the server and rechecks the connection, expiry, scope, and Space mapping for every request.
- Private-owner accounts and linked transactions are excluded even when their Space is authorized.
- Access attempts are recorded with connection, Space, endpoint, request ID, response status, and timestamp.
- New tenant tables use RLS. User-facing management requires workspace owner/admin membership.
- Project IDs must exist in the authorized external project reference table and match the transaction Space.
- Settlement and project allocation triggers prevent over-allocation and duplicate financial recognition.

Venture OS identity and MoneyYap identity remain independent. Matching email addresses do not grant access. The service credential represents a specific explicit integration authorization.
