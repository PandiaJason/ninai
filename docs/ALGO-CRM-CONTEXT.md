# ALGO CRM — development context

This is the handoff context for the ALGO CRM work inside NINAI. It explains what was built, why it behaves this way, where the code lives, and what is still missing.

- **Current branch:** `feat/projects-followups-versions`
- **Commit:** `bd9fa6a` — `Add ALGO learner and institution CRM`
- **Base work:** NINAI workspace foundation (`abb4f0b`) and projects/follow-ups (`f0e51f6`)
- **Status:** implemented, built and manually QA-tested; not yet merged upstream
- **Operating model:** [ALGO-CRM.md](./ALGO-CRM.md)

---

## 1. The problem this solves

ALGO is pre-revenue and building its first cohort. A generic CRM would measure the wrong thing: a sign-up, a "deal", or a stage moved by hand. The actual question is whether a learner requests access, attempts a challenge, comes back, and tells us what helped or blocked them.

The CRM therefore measures **activation and feedback**, not sign-ups or sales.

Core decisions:

- Signing up is not success.
- **Activation** means at least one challenge attempt.
- **Engagement** means repeat practice or structured feedback.
- **Feedback** is the successful first-cohort outcome.
- Lead **quality** is separate from pipeline stage.
- Institutions have their own pipeline and no proposal stage, because there is no confirmed institution offer or price yet.
- Use counts, not percentages, while the cohort is small.
- No mock data. Every number comes from records the team actually enters.

---

## 2. Pipelines and stage definitions

### Learner pipeline

| Stage | Meaning |
| --- | --- |
| `Requested` | Early-access request or first contact. |
| `Invited` | Access has been sent. |
| `Activated` | At least one challenge has been attempted. |
| `Engaged` | Three or more challenge attempts, repeat activity across tracks, or structured feedback. |
| `Feedback` | Structured feedback has been recorded. This is the first-cohort success stage. |
| `Nurture` | Interested but paused, or needs a later follow-up. |
| `Not fit` | Wrong audience or explicitly not interested. |

### Institution pipeline

| Stage | Meaning |
| --- | --- |
| `Prospect` | College, university or training partner identified. |
| `Contacted` | First outreach made. |
| `Discovery` | Conversation about their students and constraints. |
| `Pilot agreed` | A pilot is agreed in principle. |
| `Pilot running` | Students are using ALGO in a pilot. |
| `Partner` | A partnership is signed. This is the won stage. |
| `Not now` | Paused or declined. |

There is deliberately **no proposal or negotiation stage** for institutions. Adding one would imply a defined offer and false precision.

### Lead quality

Quality is orthogonal to stage:

| Quality | Meaning |
| --- | --- |
| `Genuine FDE intent` | Wants to do the work of a Forward Deployed Engineer. |
| `Exploring` | Curious, still deciding whether FDE is the goal. |
| `Generic coding seeker` | Looking for DSA or placement prep, not systems/FDE. |
| `Not a fit` | Wrong audience or explicitly not interested. |

An activated generic coding-course seeker is still a generic learner. Quality-adjusted activation is shown separately in Insights.

---

## 3. What was implemented

### CRM

- Separate **Learners** and **Institutions** audience tabs with persistent tab selection.
- ALGO profile fields on leads and institutions.
- Source capture and normalisation for LinkedIn, X/Twitter, Instagram, YouTube, GitHub, Reddit, Product Hunt, referrals, institutions, events/communities and other.
- Learner persona, lead quality, tracks explored, challenge attempts, last active, feedback status, drop-off reason.
- Institution type and student count.
- Filters for search, stage, owner, priority, source and quality.
- Kanban and table views, bulk stage moves, archive/delete, pagination.
- Learner detail view with activation and feedback actions.
- CSV import/export including all ALGO fields.

### Activation

- Log challenge attempts with an optional track name.
- First attempt sets `firstChallengeAt` and `lastActiveAt`.
- Automatic stage movement to `Activated` on the first attempt and `Engaged` at three attempts.
- The learner is kept in `Feedback` or `Not fit` if already there.
- Challenge attempts are recorded as lead activity and workspace activity.

### Structured feedback

- One structured feedback record per learner, editable after submission.
- Feedback request action sets status to `requested`.
- Submission sets status to `submitted`, records activity and moves the learner to the won learner stage (`Feedback`) unless they are in the lost stage (`Not fit`).

### Insights

A new `Insights` navigation module with:

- Requested → contacted → activated → engaged → feedback funnel.
- Source quality: which sources produced activated, engaged and feedback-giving learners.
- Quality mix and quality-adjusted activation.
- Current learner stage health.
- Stalled learners (14+ days without activity/contact).
- Recorded drop-off reasons.
- Recurring feedback themes.
- Stuck categories.
- Tracks explored.
- Average FDE-help rating.
- Separate institution pipeline counts, pilots and partners.
- Explicit small-cohort copy so counts are not presented as statistical significance.

### Workspace operations

- `ALGO — First Cohort` project template with milestones, tasks, a follow-up and a linked working note.
- Dashboard activation card showing learners, activated learners, feedback received and institutions.
- Settings pipeline audience tabs and an **Apply ALGO template** action.

### Persistence and migration

- Dexie schema version 10 adds `learnerFeedback` and ALGO indexes.
- Existing untouched default sales pipelines are converted to learner stages.
- Custom stages are preserved.
- Missing institution stages are added.
- Existing leads are backfilled with `audience`, `challengeAttempts` and `feedbackStatus`.
- Normalisation runs after version restore so older snapshots gain the ALGO shape.
- Feedback is included in workspace export, delete, version snapshots and cloud entity counts.

---

## 4. Data model

Defined in `src/db.ts`.

### `LeadStage`

```ts
interface LeadStage {
    id: string;
    workspaceId: string;
    name: string;
    color: string;
    order: number;
    isWon: number;
    isLost: number;
    audience?: 'learner' | 'institution';
}
```

`audience` defaults to `learner` for old records. Stage names are editable; default names are used for automatic movement. If `Activated` or `Engaged` is renamed, attempts are still stored and analytics still work, but automatic stage movement by name will not find those stages. The `Feedback` and `Not fit` stages are found by `isWon` / `isLost`, not by name.

### `Lead`

Existing fields remain. ALGO additions:

```ts
audience?: 'learner' | 'institution';
persona?: 'final_year' | 'recent_grad' | 'early_career' | 'career_switcher' | 'institution' | 'other';
quality?: 'genuine' | 'exploring' | 'generic' | 'not_fit';
firstChallengeAt?: number;
challengeAttempts?: number;
tracksExplored?: string[];
lastActiveAt?: number;
feedbackStatus?: 'not_requested' | 'requested' | 'submitted';
dropOffReason?: string;
institutionType?: string;
studentCount?: number;
```

### `LearnerFeedback`

```ts
interface LearnerFeedback {
    id: string;
    workspaceId: string;
    leadId: string;
    whyStarted: string;
    tracksExplored: string[];
    stuckCategory: 'setup' | 'concepts' | 'difficulty' | 'time' | 'value' | 'motivation' | 'bug' | 'other';
    whereStuck: string;
    continuedReason?: string;
    stoppedReason?: string;
    fdeHelpRating: number; // 1–5
    recommendations?: string;
    themes: FeedbackTheme[];
    consentToContact: number;
    submittedAt: number;
    createdBy: string;
    updatedAt: number;
}
```

Feedback themes: `clarity`, `difficulty`, `time`, `relevance`, `bugs`, `content_gap`, `motivation`.

### Schema v10 indexes

```ts
leadStages: 'id, workspaceId, audience, order, [workspaceId+order], [workspaceId+audience]'
leads: '..., audience, ..., [workspaceId+audience], ...'
learnerFeedback: 'id, workspaceId, leadId, submittedAt, [workspaceId+submittedAt], [leadId+submittedAt]'
```

Workspace IDs on records are always checked in the service layer.

---

## 5. Activation, engagement and contact rules

Implemented in `src/services/analytics.ts` and `src/services/leads.ts`.

```text
Activated =
  firstChallengeAt exists
  OR challengeAttempts > 0
  OR feedback exists

Engaged =
  challengeAttempts >= 3
  OR feedback exists
  OR current stage name is "engaged" or "feedback"

Contacted =
  lastContactedAt exists
  OR learner is activated
  OR current stage is invited/activated/engaged/feedback/nurture

Stalled =
  not won/lost
  AND lastActiveAt, lastContactedAt or updatedAt is 14+ days old
```

`logChallengeAttempt()`:

- Accepts 1–50 attempts per call and an optional track.
- Appends the track to `tracksExplored`.
- Moves to `Activated` on the first attempt.
- Moves to `Engaged` at three attempts.
- Does not move a learner out of `Feedback` or `Not fit`.

---

## 6. Feedback lifecycle

Implemented in `src/services/feedback.ts`.

1. Team requests feedback from the learner detail view.
   - `feedbackStatus` becomes `requested`.
   - A lead activity and workspace activity are recorded.
2. Team records the structured conversation.
   - Required: why they started, stuck category, where they got stuck, FDE-help rating.
   - Optional: tracks, why they continued, why they stopped, recommendations, themes, consent.
3. Saving the feedback:
   - Keeps one record per learner (`leadId`).
   - Sets `feedbackStatus` to `submitted`.
   - Moves the learner to the learner stage with `isWon = 1` (`Feedback`) unless they are in the lost stage.
   - Records a feedback activity.
4. Deleting feedback:
   - Sets `feedbackStatus` back to `not_requested`.
   - Does not move the learner back out of the stage automatically.
   - Records the deletion in workspace activity.

The form is `src/components/workspace/FeedbackForm.tsx`.

---

## 7. Analytics definitions

Implemented in `src/services/analytics.ts`; rendered by `src/components/workspace/AnalyticsView.tsx`.

### Learner totals

- `total`: active learner records.
- `activated`, `engaged`, `feedback`: rules above.
- `genuine`: learners with quality `genuine`.
- `stalled`: 14+ days quiet and not won/lost.
- `absentSource`: learners with no source.
- `averageRating`: mean FDE-help rating across feedback records.

### Funnel

`Requested` is every learner, not only those explicitly in the Requested stage. Each later step is independent and uses recorded evidence, so the funnel is not purely stage-based.

### Source rows

Grouped by normalised source, sorted by feedback, then engaged, then total. Includes activation and feedback rates.

### Quality rows

One row per quality plus `Unclassified`. Each shows total, activated and feedback counts.

### Stage health

Counts learners and institutions in their own stages, using stage colours.

### Drop-off

Groups non-empty `dropOffReason` values and shows the top eight.

### Feedback themes

Counts only themes explicitly tagged in structured feedback, plus stuck categories, top ten tracks and average rating.

### Institutions

Total, partners (`isWon = 1`), pilots (stage name contains `pilot`), and stage counts.

---

## 8. UI and navigation

- Route/module name: `analytics`, shown as **Insights**.
- Sidebar icon: `chart`.
- Main components:
  - `src/components/workspace/CRMView.tsx`
  - `src/components/workspace/LeadForm.tsx`
  - `src/components/workspace/LeadDetail.tsx`
  - `src/components/workspace/FeedbackForm.tsx`
  - `src/components/workspace/AnalyticsView.tsx`
  - `src/components/workspace/SettingsView.tsx`
  - `src/components/workspace/DashboardView.tsx`
- Styling is added to `src/components/workspace/Workspace.css` using the existing design language. No new design system or font was introduced.
- The notes editor, TipTap setup, permissions model and local-first storage are unchanged.

---

## 9. First-cohort project template

Implemented in `src/services/algoSetup.ts`.

Applying **Settings → Pipelines → Apply ALGO template**:

1. Calls `ensureAlgoPipelines()` to create or repair both pipelines.
2. Looks for an existing project with identifier `ALGO-GTM` or name `ALGO — First Cohort`.
3. Returns the existing project instead of duplicating it.
4. Otherwise creates:
   - Project `ALGO — First Cohort`
   - Four milestones over 30 days
   - Six GTM/activation tasks
   - A founder review follow-up after 30 days
   - A workspace note linked to the project

The project is intended to be the founder/CMO operating space: milestones, tasks, follow-ups and the working note travel together in versions and exports.

The template does not delete leads or custom stages.

---

## 10. CSV import/export

Implemented in `src/services/leads.ts`.

Exported columns:

```text
Lead Name, Audience, Company, Email, Phone, Website, Job Title, Stage, Priority,
Deal Value, Source, Source Detail, Persona, Quality, Industry, Location,
Institution Type, Student Count, Challenge Attempts, Tracks, First Challenge,
Last Active, Feedback Status, Drop-off Reason, Owner Name, Owner Email,
Description, Tags, Last Contacted, Next Follow-up, Created At
```

Import behaviour:

- `Audience` containing institution/college/university goes to the institution pipeline.
- Stage is matched by name or id inside the correct audience pipeline.
- Source is normalised through the alias map.
- Quality and persona accept canonical values or common text such as `genuine`, `FDE`, `generic`, `DSA`, `not fit`, `exploring`.
- Attempts accept `attempts` or `challengeAttempts`.
- Tracks are split on commas or semicolons.
- Duplicate leads are skipped using existing duplicate detection.
- Invalid rows are reported with row numbers.

The sample CSV is kept with the import modal.

---

## 11. Permissions and security

- Existing Admin/Member model is preserved.
- Workspace access is checked in the service layer for reads and writes.
- Creating or changing pipelines and applying the ALGO template requires Admin.
- Lead edits and feedback writes use the existing `assertLeadEdit` permission path.
- Feedback only applies to learner records.
- Institution records cannot receive learner feedback.
- Stage moves are constrained to the record's own audience pipeline.
- No credentials or tokens were added to the CRM.

---

## 12. Versions, backup and migration

- `src/services/versions.ts` includes `learnerFeedback` in snapshots, size counts, restore deletion and restore insertion.
- After any restore, `ensureAlgoPipelines()` normalises older snapshots.
- `src/services/workspace.ts` includes feedback in workspace export and delete.
- `src/services/cloud.ts` counts feedback records in backup payloads.
- `src/services/auth.ts` seeds both pipelines for new workspaces through `ensureAlgoPipelines()`.
- `src/services/pipeline.ts` exposes `applyAlgoPipelines()` for Settings.

Migration is deliberately conservative:

- It converts a pipeline only when it still matches the original default sales stages.
- It preserves custom stages.
- It merges the old converted stage into the feedback stage where necessary and re-points leads.
- It backfills missing ALGO fields without overwriting existing values.

---

## 13. Collaboration limitation

NINAI is local-first. Each device has its own IndexedDB database. Workspace membership, roles and permissions work on that device. Versions, cloud export and Git export are **backups**, not live multi-user collaboration.

That means:

- A change made by the CMO on another laptop will not appear live for the founder.
- Two people cannot safely edit the same live CRM on separate devices yet.
- The founder and CMO can share one operations device/account and export snapshots after sessions.

For true shared access, the recommended options are:

1. **Supabase Pro, about $25/month** — Postgres, auth, row-level security and realtime, with the least custom infrastructure.
2. **Cloudflare Worker + D1/Durable Objects** — lower running cost, but requires custom authentication, permissions, conflict handling and migration work.

This decision is still open. Do not describe the current app as live multi-user without a backend.

---

## 14. Verification

- `npm run build` passes (`tsc -b && vite build`).
- Electron QA ran on a temporary fresh profile:
  - login
  - Insights
  - learner pipeline
  - institution pipeline
  - learner detail
  - challenge attempt
  - feedback submission
  - no page errors
- QA screenshots are outside the repo in the temporary opencode folder.
- `npm run lint` has pre-existing failures and is not the release gate for this change.
- There is no automated test suite dedicated to the ALGO migration yet. Migration logic is covered by type checking and manual QA.

To run locally:

```powershell
npm run dev
# or the desktop app
npm run desktop
```

Default first-run admin:

```text
admin@ninai.app
ninai-admin
```

Change it from **Settings → Profile**.

---

## 15. File map

| File | Responsibility |
| --- | --- |
| `src/db.ts` | Schema v10, ALGO types, default pipelines, migration. |
| `src/services/algo.ts` | Source aliases, labels, personas, qualities, feedback constants, track suggestions, pipeline seeding/normalisation. |
| `src/services/leads.ts` | Lead CRUD, ALGO validation, challenge attempts, feedback requests, CSV import/export. |
| `src/services/feedback.ts` | Structured feedback CRUD and stage transition. |
| `src/services/analytics.ts` | Funnel, source, quality, stage, drop-off, theme, track and institution analytics. |
| `src/services/algoSetup.ts` | First-cohort project, milestones, tasks, follow-up and linked note. |
| `src/services/pipeline.ts` | Pipeline/stage administration and ALGO template action. |
| `src/services/versions.ts` | Snapshot/restore integration and post-restore normalisation. |
| `src/services/workspace.ts` | Workspace export/delete integration. |
| `src/services/cloud.ts` | Backup payload entity counts. |
| `src/services/dashboard.ts` | Activation and feedback dashboard metrics. |
| `src/components/workspace/CRMView.tsx` | Audience tabs, filters, kanban/table, ALGO badges. |
| `src/components/workspace/LeadForm.tsx` | Learner/institution profile fields. |
| `src/components/workspace/LeadDetail.tsx` | Activation and feedback cards. |
| `src/components/workspace/FeedbackForm.tsx` | Structured feedback modal. |
| `src/components/workspace/AnalyticsView.tsx` | Insights module. |
| `src/components/workspace/SettingsView.tsx` | Pipeline audience tabs and template action. |
| `src/components/workspace/DashboardView.tsx` | ALGO activation card. |
| `src/components/workspace/Workspace.css` | ALGO CRM styling. |
| `docs/ALGO-CRM.md` | Short operating model and CEO message. |
| `docs/ALGO-CRM-CONTEXT.md` | This handoff context. |

---

## 16. Known limitations and next steps

### Known limitations

- No live multi-device collaboration; a backend is required.
- No confirmed institution offer or price, so the institution pipeline intentionally stops at discovery/pilot.
- One feedback record per learner. It can be edited, but it is not a time-series of interviews.
- Automatic stage movement depends on the default `Activated` / `Engaged` stage names.
- Track names are suggestions; the authoritative list of ALGO's 20 system tracks was not supplied. The UI must not pretend the suggestion list is complete.
- No automated migration test yet.
- Product pricing is unconfirmed (`₹799/month`, `₹6,999/year` discussed), so the CRM does not use revenue as a success metric.

### Recommended next steps

1. Run the first cohort on one shared operations device.
2. Record every request with its real source; never leave source blank.
3. Log challenge attempts the same day.
4. Conduct structured feedback interviews after activation, not after sign-up.
5. Review Insights weekly: source quality, drop-off and recurring themes.
6. Choose Supabase or Cloudflare before the second cohort and implement real shared access.
7. Replace the provisional track suggestion list with the confirmed ALGO track names.
8. Add automated tests for the v9 → v10 migration and feedback stage transitions.

---

## 17. Upstream PR

The branch is pushed to the fork:

```text
https://github.com/PandiaJason/ninai/compare/main...padhmawathye-hash:feat/projects-followups-versions?expand=1
```

The available GitHub token is read-only for `PandiaJason/ninai`, so the PR must be opened in the GitHub UI.

---

## 18. CEO message

> We now have one place to see whether ALGO is actually working: where learners came from, whether they attempted a challenge, where they stopped, and what they told us. The founder and CMO can run the same first-cohort workspace today, but live collaboration across separate devices still needs a backend. Next: use one shared operations device for the first cohort, record feedback after every activation, review Insights weekly, and choose Supabase or Cloudflare for real shared access before the next cohort.
