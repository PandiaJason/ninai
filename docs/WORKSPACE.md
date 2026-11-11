# NINAI workspace

NINAI is local-first. The workspace database lives in IndexedDB through Dexie, and the new workspace layer adds projects, unified follow-ups, version snapshots, cloud backup and Git export without changing the notes experience.

## Persistence layers

| Layer | Where the data lives | Who can use it |
| --- | --- | --- |
| Primary workspace | IndexedDB on the current device | Every signed-in member on that device |
| Local versions | `workspaceVersions` snapshots inside IndexedDB | Members can create and download; admins can restore and delete |
| Cloud backup | A private JSON endpoint, for example the included Cloudflare Worker + R2 scaffold | Admins upload and download; members can save local settings |
| Git backup | `ninai-workspace.json` and `README.md` in a folder chosen in the desktop app | Any signed-in member using the desktop app |

The primary database is never replaced by a cloud connection. Cloud and Git are explicit backups. A restore always creates a safety snapshot first.

## ALGO CRM

The CRM is split into a learner activation pipeline and a separate institution pipeline, with structured learner feedback and a source-quality Insights view. See [ALGO-CRM.md](./ALGO-CRM.md) for stage definitions, activation rules, feedback fields, analytics and the current collaboration limits.

## Projects

Projects are restored on top of the dormant project tables. A project has:

- An owner or creator who can edit and archive it.
- An admin-only delete path.
- Members, objectives, dates, status, priority and an identifier.
- Milestones with due dates and completion.
- Linked CRM leads.
- Tasks, notes, follow-ups and an activity timeline.

Progress combines completed tasks and completed milestones. Deleting a project removes its milestones and project links; tasks stay in Tasks but are unlinked, so delivery history is not silently destroyed.

## Follow-ups

Follow-ups are a single model across leads, projects, tasks and notes:

- Channel: call, email, meeting, message or other.
- Owner, due date, notes and pending/completed/cancelled status.
- Completing one records an outcome and can schedule the next follow-up automatically.
- Lead follow-ups update the lead's next action and last-contact fields.
- Follow-ups appear on the record, in Follow-ups, on the dashboard, in the calendar and in global search.

## Permissions

- Workspace access is checked in the service layer for every read and write.
- Admin and member roles are unchanged.
- Project edit and archive: admin, project owner or creator.
- Project delete: admin or creator.
- Version restore/delete: admin.
- Follow-up delete: admin, creator or assignee.
- Tasks keep their existing owner/assignee rules.

## Cloud backup

1. Deploy the Worker in `cloudflare/worker` and set `BACKUP_TOKEN`.
2. Open Settings -> Versions & backup -> Cloud backup.
3. Enter the Worker base URL and the same token.
4. Test the connection, then upload.

The Worker stores `workspaces/<workspaceId>/latest.json` and versioned objects in R2. See `cloudflare/worker/README.md` for deployment commands.

## Git backup

Use Settings -> Versions & backup -> Export to Git in the desktop app. Choose a folder. NINAI writes the workspace JSON, initialises Git if needed, and commits with the local Git identity. No token is stored by NINAI.

## Packaging

`.github/workflows/build.yml` builds:

- Windows x64 NSIS installer.
- Linux x64 AppImage.
- macOS x64 DMG/ZIP on `macos-15-intel`.
- macOS arm64 DMG/ZIP on `macos-latest`.

Artifacts are uploaded for each matrix job. Local `npm run dist` packages the current platform.

## Multi-device collaboration

Each device keeps its own IndexedDB. Git is the code-collaboration channel and the cloud endpoint is a backup channel. True shared realtime workspace data needs a backend with authentication and permissions; a Cloudflare Worker + D1/Durable Objects or Supabase deployment is the next step if the team needs one shared live database.
