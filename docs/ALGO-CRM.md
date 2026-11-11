# ALGO CRM inside NINAI

The ALGO CRM is an activation and feedback system, not a generic sales pipeline. Signing up is not success. The first cohort succeeds when a learner attempts a challenge, comes back, and tells us what helped or blocked them.

For the full implementation handoff — data model, activation rules, analytics definitions, file map, verification and known limitations — see [ALGO-CRM-CONTEXT.md](./ALGO-CRM-CONTEXT.md).

## Two pipelines

| Learner stage | Meaning |
| --- | --- |
| Requested | Early-access request or first contact. |
| Invited | Access has been sent. |
| Activated | At least one challenge has been attempted. |
| Engaged | Repeat practice across sessions or tracks, or structured feedback received. |
| Feedback | A structured feedback conversation has been recorded. This is the first-cohort success stage. |
| Nurture | Interested but paused, or needs a later follow-up. |
| Not fit | Wrong audience or explicitly not interested. |

| Institution stage | Meaning |
| --- | --- |
| Prospect | College, university or training partner identified. |
| Contacted | First outreach made. |
| Discovery | Conversation about their students and constraints. |
| Pilot agreed | A pilot is agreed in principle. |
| Pilot running | Students are using ALGO in a pilot. |
| Partner | A partnership is signed. |
| Not now | Paused or declined. |

There is deliberately no proposal or negotiation stage for institutions. ALGO does not have a confirmed institution offer yet, so the CRM must not imply one.

## Activation, engagement and quality

- **Activated** means `firstChallengeAt` exists or `challengeAttempts > 0`.
- **Engaged** means three or more challenge attempts, a feedback record, or the Engaged/Feedback stage.
- **Quality** is recorded separately from stage: genuine FDE intent, exploring, generic coding-course seeker, or not a fit.
- A generic coding-course seeker who attempts a challenge is still a generic learner. The analytics do not count that as a quality activation.

The ALGO profile fields are optional on old records. Missing values are treated as learner, no quality assessment and no activation.

## Structured feedback

Each learner can have one feedback record containing:

- Why they started.
- Tracks explored.
- Where they got stuck, with a category.
- Why they continued and why they stopped.
- Whether ALGO helped FDE preparation (1–5).
- What should change.
- Recurring themes and consent to follow up.

Submitting feedback moves the learner to the Feedback stage unless they are already marked Not fit.

## Analytics

Insights include:

- Requested → contacted → activated → engaged → feedback.
- Source quality: which sources produced activated, engaged and feedback-giving learners.
- Quality mix and quality-adjusted activation.
- Current stage health, stalled learners and recorded drop-off reasons.
- Feedback themes, stuck categories, tracks explored and average FDE-help rating.
- Institution pipeline counts, pilots and partners.

With a small first cohort, counts are more trustworthy than percentages. The interface says this explicitly instead of presenting false precision.

## First-cohort project

Settings → Pipelines → **Apply ALGO template** creates or repairs both pipelines and, if missing, the shared project **ALGO — First Cohort** in Projects. The project contains milestones, tasks, a review follow-up and a linked working note. Applying it does not delete existing leads or custom stages.

## Sharing between the founder and CMO

NINAI is local-first and stores its database per device. Workspace membership, roles and permissions work on that device, and versions/cloud/Git are backups. They are **not live multi-user collaboration**: a change made by the CMO on another laptop will not appear for the founder until a shared backend exists.

Until a backend is implemented:

1. Use one shared operations device or account for the live first-cohort CRM.
2. Export a version snapshot or CSV after each working session.
3. Keep the founder/CMO decisions in Projects, Follow-ups and the linked working note so they travel with the snapshot.

For true shared access, the recommended production option is Supabase Pro at about $25/month (Postgres, auth, row-level security and realtime). A Cloudflare Worker + D1/Durable Objects backend is the lower-cost custom option, but it needs authentication and permission work.

## CEO message

> We now have one place to see whether ALGO is actually working: where learners came from, whether they attempted a challenge, where they stopped, and what they told us. The founder and CMO can run the same first-cohort workspace today, but live collaboration across separate devices still needs a backend. Next: use one shared operations device for the first cohort, record feedback after every activation, review Insights weekly, and choose Supabase or Cloudflare for real shared access before the next cohort.
