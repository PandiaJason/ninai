# Ninai learner-management integration

The API is server-to-server. Desktop/browser clients authenticate to Ninai's existing shared server; they never receive the ALGO signing key or direct database access.

## Capabilities

- `GET /api/integrations/ninai/users?page=1&q=&status=all`: 25 entries/page, `hasMore`, names, account status, last recorded activity and execution counts. `runs24h` is a rolling 24-hour count, not a daily allowance. Infrastructure ERROR records are excluded. No code, passwords, OAuth tokens or private submission payloads are returned.
- `POST /api/integrations/ninai/users`: strict JSON `{email, approved, reason}`. Approve/revoke learner access only. Owner and existing ADMIN accounts cannot be changed. No role assignment, account deletion, execution grants or challenge publishing powers.
- Existing challenge 6-20 owner-only locks remain authoritative even after approval. Public lesson browsing remains available; execution approval is checked on every Run/Submit, so revocation affects existing learner sessions. Submitted history is preserved.
- Each mutation and its audit record share a database transaction. The service runs under the owner's delegated authority; metadata records the actual Ninai actor email, target and required reason.

## Server configuration

Generate one random 32-byte key, represented as 64 hexadecimal characters. Store the same value as `ALGO_NINAI_HMAC_KEY` in Vercel production and `/etc/ninai/api.env`. Do not place it in source, `VITE_` variables, desktop settings, localStorage or chat.

ALGO `ALGO_NINAI_ACTORS_JSON` is a JSON object mapping each explicitly authorized, lowercase email to `["users:read","access:write"]`. Give a future read-only operator only `users:read`. An absent key or missing policy disables access.

Ninai `ALGO_INTEGRATION_EMAILS` is the matching comma-separated operator email list. `ALGO_INTEGRATION_ORIGIN=https://algoskills.in`. These people need existing shared-server Ninai accounts, not merely local desktop profiles. Ninai re-reads identity and active status from its database on each request, checks its revocation list, and derives the actor from that account; browser-supplied actors are rejected.

## Request authentication

Headers: `x-ninai-actor`, `x-ninai-timestamp` (Unix seconds), `x-ninai-nonce` (32 lowercase hex characters), `x-ninai-signature` (64 lowercase hex characters).

HMAC-SHA256 signs these six newline-separated fields with the shared key string: uppercase method; exact pathname plus query; timestamp; nonce; normalized actor email; hexadecimal SHA256 of the exact UTF-8 request body. No final newline. GET signs an empty body. The secret is used as its hexadecimal string on both servers, not decoded bytes.

ALGO checks the signature with a constant-time comparison, permits at most 60 seconds of clock skew, enforces actor scopes, then uses shared Redis to reject reused nonces and limit each actor to 60 requests/minute. Nonces live for 180 seconds. Redis failure denies the request; it never falls back to process-local replay protection. Request bodies are capped at 2KB and responses are not cached. No browser CORS access is granted.

Ninai signs a fresh request for each call, uses a 12-second timeout and refuses redirects. Rotate a suspected compromised key on both servers. Remove an actor from either server's allowlist to withdraw bridge access. Signing authority is a trusted Ninai server capability; protect that server and its environment file accordingly.

## Activation and checks

1. Configure both server environments without displaying secrets. Restart Ninai after its tested code is deployed.
2. Deploy ALGO, then sign in to Ninai using an allowed shared account. In Learners, open **ALGO accounts**.
3. Confirm unauthorized accounts are denied, search/pagination works, and protected administrators have no editable controls.
4. Approve/revoke a test learner with an explicit reason. Confirm the ALGO audit metadata identifies the operator. Do not use a real person's account for automated tests.

Automated checks: `npx vitest run src/lib/integrations/ninai-auth.test.ts src/app/api/integrations/ninai/users/route.test.ts`; in Ninai, `node --test server/tests/algo-client.test.js server/tests/algo-access.test.js` and `npm run build`.
