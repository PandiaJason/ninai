# NINAI Workspace — Development Progress

## Phase 1 — Codebase Assessment (completed before modification)

### Stack detected

| Area | Existing implementation |
|---|---|
| Frontend | React 19 + TypeScript, Vite 7 |
| Desktop shell | Electron 40 (`electron/main.js`, `preload.js`) |
| Persistence | Dexie 4 (`src/db.ts`) over IndexedDB — **local-first, no REST server** |
| Notes editor | TipTap 3 + Markdown, task lists, tables, images |
| Drag & drop | `@dnd-kit/core` + `@dnd-kit/sortable` (already installed and used by folders) |
| Styling | Plain CSS + design tokens in `src/index.css`; Inter; white surfaces, #0071e3 accent, 6/12/18px radii, subtle borders and shadows |
| Routing | None. `App.tsx` renders a keep-alive webview switcher plus notes panel |
| State | Local component state + `dexie-react-hooks` live queries; `localStorage` for preferences |
| Auth | None. Single implicit local user with `ninai_username` avatar |
| Notes architecture | `notes` and `folders` tables; folders nested via `parentId`; notes grouped by `updatedAt`; autosave debounce 1.5s; TipTap HTML content |

### Existing reusable UI inventory

- `Layout.tsx` — resizable notes/browser split, zen mode, sidebar collapse.
- `Sidebar.tsx` — 64px icon rail, profile popover, custom site add/remove, backup & factory reset.
- `NotesPanel.tsx` — three-pane notes workspace (folders / list / editor), search, context menus, move modal, reminder popover.
- `FolderList.tsx` — nested folders, dnd-kit sorting, rename/move/delete context menu.
- `NotePreviewCard.tsx`, `RemindersWidget.tsx` (home dashboard), `ExportButton.tsx`, `SettingsModal.tsx`.
- CSS patterns: `.icon-btn-primary`, `.icon-btn-ghost`, `.folder-item`, `.menu-item`, `.modal-backdrop/.modal-content`, `.search-wrapper`, `.reminder-*`, `.home-*`.
- Design tokens: `--accent-primary`, `--surface-mid`, `--border-subtle`, `--radius-md`, `--shadow-*`, `--text-*`.

### Data assessment

Current Dexie schema: `notes`, `folders`. No users, CRM, projects, tasks, tags, associations, calendar or activity data. No migrations beyond v7. There is no backend boundary — components write directly to tables.

### Architecture decision (least disruptive)

Because NINAI is explicitly a local-first Electron app, introducing a separate Node/HTTP server would change the product's installation, sync and security model. The application will instead gain a **strict domain/service layer** (`src/services/*`) that acts as the local backend boundary:

- Every new mutation goes through validated, permission-checked service functions.
- All service functions re-read the authenticated local session and membership; UI visibility is never the authorization mechanism.
- Dexie transactions protect multi-table writes.
- Authentication is added as a local multi-account layer with PBKDF2-hashed passwords, Admin/Member roles, and workspace membership. It is an accountability/authorization layer on the device, not network authentication (documented limitation).

### Reuse rules

- Keep the existing Sidebar, Layout, TipTap notes editor, FolderList and CSS tokens.
- Add module navigation to the existing 64px rail; do not replace the rail.
- Build new screens with the existing visual language (Inter, white cards, 1px subtle borders, 12px radius, blue accent, low-motion interactions).
- Reuse existing `modal-*`, `folder-item`, `menu-item`, `.icon-btn-*` patterns where they fit; new reusable primitives live in `src/components/ui` and use the same tokens.

### Planned schema (Dexie v8)

`users`, `workspaces`, `workspaceMembers`, `leadStages`, `leads`, `leadActivities`, `projects`, `projectMembers`, `projectLeads`, `projectMilestones`, `tasks`, `subtasks`, `taskComments`, `calendarEvents`, `tags`, `recordTags`, `noteLinks`, `notifications`, `activities`.

Existing `notes`/`folders` gain `workspaceId`, `archived` (notes), preserving all previous fields and behaviour.

> **Current scope:** the project tables above remain in the schema as dormant legacy tables. The Projects product surface, service, navigation and all cross-feature project links have been removed. `tasks.projectId` and `calendarEvents.projectId` also remain as optional dormant columns for backward-compatible local data.

### Implementation phases

- [x] Phase 1 — Assessment
- [x] Phase 2 — Foundation (schema, seed, auth, roles, workspaces, UI primitives, navigation)
- [x] Phase 3 — CRM
- [x] Phase 4 — Tasks
- [x] Phase 5 — Notes integration (links, tags, archive, workspace filtering)
- [x] Phase 6 — Calendar & global search
- [x] Phase 7 — Dashboard
- [x] Phase 8 — Testing & refinement

## Delivered

| Module | What is implemented |
|---|---|
| Auth | Local multi-account sign-in, PBKDF2-SHA256 passwords, Admin/Member roles, workspace membership, profile/password changes, onboarding retained. |
| Dashboard | Live KPIs, recent leads, my tasks, upcoming calendar items, recent notes, workspace activity; deep links into every remaining module. |
| CRM | Configurable 8-stage pipeline, Kanban + sortable table, search/filter/sort/pagination, full CRUD, archive/restore, bulk actions, lead detail with activity timeline, follow-ups, CSV import (mapping, validation, duplicate detection) and CSV export. |
| Tasks | List/Kanban with drag-and-drop, My/All/Overdue/Upcoming/Completed views, priorities, assignees, lead links, subtasks, comments, sort and filters, task detail modal. |
| Notes | Existing TipTap editor, folders, drag-and-drop and reminders preserved; workspaces, All/Favourites/Archived virtual folders, archive/restore, favourites, tags, links to leads/tasks, workspace-scoped search. |
| Calendar | Month/week/day views, meetings, follow-ups, task deadlines, lead follow-ups and lead activity, create/edit/delete with lead associations. |
| Search | Ctrl/⌘ K global palette across leads, tasks, notes and folders, type filters, keyboard navigation and direct entity navigation. |
| Settings | Profile, workspace create/rename/switch/delete, people (create, role, activate/deactivate, password reset, membership), pipeline stage management, data export. |

## Verification performed

All checks were run against the real app (Vite dev server + headless Chrome/CDP) and the real Dexie/IndexedDB services — no mocked data.

- **Earlier domain/service suite (pre-removal):** 62 assertions across auth, workspaces, leads, projects, tasks, subtasks, comments, milestones, calendar aggregation, notes/links, search, pipeline, CSV import/export and dashboard. All product behaviours passed.
- **Projects removal suite (current code):** 35 live checks with zero runtime exceptions — sidebar module list, dashboard KPI count and sections, task filters/table/form/detail, task create + delete without a project, calendar legend and event form, global search filters/placeholder, note link picker, CRM lead detail, Settings data cards, and legacy `projects` module fallback. Run against the real Vite app and Dexie data.
- **Permission suite:** member can read the workspace but cannot delete leads/tasks, create users or change roles; deactivated users cannot sign in; admin session restores correctly.
- **UI workflows:** lead detail + activity logging, lead creation, CRM table, task comment/subtask, calendar event creation, global search + navigation, note favourites/archive/restore/links/search, member-restricted Settings and lead actions. All passed with zero runtime exceptions.
- **Build:** `npm run build` (`tsc -b && vite build`) passes.
- **Clean state:** all QA leads, tasks, events, notes, tags, activities and probe accounts were deleted after testing; only the seeded workspace, admin, default stages and default notes remain. Dormant project tables contain 0 records.

### Defects found and fixed during verification

- Toolbar `<select>` controls inherited `width: 100%` and stacked vertically in CRM/Tasks — constrained to natural widths in toolbars and bulk bars.
- Global search result title and subtitle rendered on one line — result body now uses a column flex layout.
- Global search overlay was mounted inside the Layout content container, so it was invisible when the Notes module hid that container — the palette is now rendered at app root.
- Task deletion queried the unindexed `calendarEvents.taskId` column, causing a `SchemaError` when deleting a task with any calendar data. Deletion now filters calendar events before clearing the task link.
- Earlier in the build: a Rules of Hooks violation from `useRef` below auth/onboarding guards was fixed by moving refs above the guards.

## Known limitations

- Projects are not part of the current product. Their Dexie tables and legacy `projectId` columns remain dormant so older local data is not destroyed and the feature can be restored later.
- Authorization is enforced in the local domain layer, not by a remote server; a user with direct IndexedDB/devtools access can bypass it.
- Multi-user means multiple local accounts on the same device. There is no network sync or real-time collaboration.
- CSV import expects a header row and maps columns in the UI; large files are processed on the main thread.
- Calendar is timezone-local; events use the device clock and are not normalised across time zones.
- The Notes editor intentionally remains the original TipTap implementation; new workspace features wrap it rather than replacing it.
- Existing non-fatal console warnings remain: Electron's `allowpopups` attribute warning and a duplicate TipTap `link` extension registration.

## Default access

- Admin: `admin@ninai.app` / `ninai-admin` (change it from Settings → Profile → Password).
- The app stores everything in IndexedDB via Dexie; use Settings → Data to export workspace JSON, and the existing sidebar backup for full local data.
