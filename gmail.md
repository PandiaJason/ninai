# Gmail learner progress detection

Ninai can read the emails your learners send you and turn them into CRM
progress: challenge attempts, structured feedback, open questions and meeting
requests. Nothing is written to a learner record automatically — every message
goes to a review queue first.

## How it works

1. **Connect (Settings → Gmail).** Google OAuth with PKCE. Ninai asks for
   `gmail.readonly` only: it can list and read mail, it cannot send, delete or
   modify anything. The consent screen opens in your normal browser; the code
   comes back to a one-shot loopback server (`http://127.0.0.1:<port>`) that
   the Electron main process runs for the duration of the sign-in.
2. **Sync (Gmail → Sync now).** Ninai searches the mailbox for messages sent by
   the addresses on your learner records (`from:{a@b.com c@d.com}`), reads the
   last 60 days, and ignores mail it has already seen.
3. **Detect.** Each message is matched to a learner by sender address and
   classified:
   - `challenge` — a completed attempt or submission (optionally the track).
   - `feedback` — a reply while feedback was requested, a rating like `4/5`, or
     talk about being stuck. Extracts the track, rating, stuck category and
     why they started.
   - `question` — a question that needs an answer.
   - `meeting` — asks for a call, meeting or a slot.
   - `other` — logged to the timeline, no progress change.
4. **Review (Gmail in the sidebar).** Every message shows the matched learner,
   the detected signal and what was extracted. For feedback you can correct
   the rating and the stuck category first. **Apply** writes the change through
   the normal domain services, **Dismiss** discards it.

Applying uses the existing rules, so nothing is special-cased for Gmail:

| Signal | What Apply does |
| --- | --- |
| challenge | `logChallengeAttempt` — increments attempts, sets first/last activity, adds the track, advances Activated/Engaged, writes the challenge + email timeline entries. |
| feedback | `saveLearnerFeedback` — stores why they started, where they got stuck, the rating and the themes, moves the learner to the feedback stage. |
| question / meeting | `createFollowUp` (email or meeting channel, due in two days) plus the email timeline entry. |
| other | Email timeline entry only. |

## Setting up a Google OAuth client

You need your own client id — the app never ships one.

1. Open [Google Cloud Console](https://console.cloud.google.com/), create (or
   pick) a project.
2. Enable **Gmail API** (APIs & Services → Library).
3. Configure the OAuth consent screen: type **External**, add your Gmail
   address as a test user. While the app is in testing you only need your own
   account to sign in.
4. Create credentials: **OAuth client ID → Desktop app**. Copy the client id.
5. Paste it into **Settings → Gmail → Client id** and press *Connect Gmail*.

Tokens are stored in the local IndexedDB profile of this machine and never
leave the device. Deleting the connection in Settings removes them.

## Limits and deliberate choices

- Only mail from addresses that exist on a learner record is read. A learner
  writing from a second address is not picked up.
- The classifier is rule-based and deterministic: no model call, no data
  leaves the machine, and the same email always produces the same reading.
  It is tuned for short, honest replies — long threads are summarised by
  subject and snippet.
- Detection never changes a record on its own. Review is the guardrail.
