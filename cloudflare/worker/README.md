# NINAI cloud backup Worker

Private backup endpoint for NINAI workspaces. The app stays local-first; this Worker stores explicit, versioned JSON snapshots in R2.

## Deploy

```bash
cd cloudflare/worker
npm install -g wrangler
wrangler login
wrangler r2 bucket create ninai-backups
wrangler secret put BACKUP_TOKEN
wrangler deploy
```

Set `ALLOWED_ORIGIN` in `wrangler.toml` to your app origin for a stricter CORS policy. Keep `*` only for local testing.

## Configure NINAI

Open **Settings → Versions & backup → Cloud backup** and enter:

- Endpoint: `https://ninai-backup.<your-subdomain>.workers.dev`
- Access token: the same value stored in `BACKUP_TOKEN`

Then use **Test connection**, **Upload now**, or **Download latest**.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Reachability check |
| `POST` | `/backup/:workspaceId` | Upload a NINAI snapshot as a new version |
| `GET` | `/backup/:workspaceId/latest` | Download the latest snapshot |
| `GET` | `/backup/:workspaceId/versions` | List stored versions |

Snapshots are capped at 50 MB. R2 keys are scoped by workspace id, and every upload writes both a versioned object and `latest.json`.

## Cost

R2 includes 10 GB storage and no egress fees. Workers Paid starts at $5/month; the free Worker plan is enough for occasional manual backups. D1 is not required for this backup-only endpoint.
