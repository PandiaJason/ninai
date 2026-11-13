# Installing NINAI

NINAI is a desktop app for the shared workspace. Everyone on the team installs
it on their own machine and signs in with the same account — the records live
on the server, so everyone's looking at the same data.

## 1. Get the installer

Every push to `main` builds the installers automatically. Go to the
**Actions** tab of the repository, open the latest **Build desktop apps**
run, and download the artifact for your machine:

| Machine | Artifact |
|---|---|
| Mac (Apple silicon) | `ninai-mac-arm64` → the `.dmg` |
| Mac (Intel) | `ninai-mac-x64` → the `.dmg` |
| Windows | `ninai-win-x64` → the `.exe` |
| Linux | `ninai-linux-x64` → the `.AppImage` |

If you were sent a download link, use that — it points at the same files.

## 2. Install

**macOS** — open the `.dmg`, drag **Ninai** into **Applications**, then open
it from Applications. The first launch asks you to confirm the app is safe to
open (it is unsigned): right-click the app in Applications → **Open** →
**Open**. After that it opens normally.

**Windows** — double-click the `.exe` and follow the prompts.

**Linux** — make the `.AppImage` executable (right-click → Properties → tick
*Allow executing file as a program*) and run it.

## 3. Sign in

The app is already pointed at the shared server, so there is nothing to
configure. Sign in with the account you were given:

```
ceo@algoskills.in
```

If sign-in fails with *"Authentication failed due to a server error"*, the
server cannot reach its database — message the founder rather than retrying.

## 4. Changing the server later

The address is baked in at build time, but every install can be pointed
somewhere else:

**Settings → Server** — paste the API address (for example
`https://api.your-domain.com/api`) and press **Save**.

The same control sits under the login form, so you can fix it before signing
in if the server has moved.

## What is stored where

- **On the server:** learners, institutions, notes attached to a learner, the
  Founder Channel, your account
- **On your machine:** projects, tasks, follow-ups, the calendar, standalone
  notes, activity history, pipeline stages, workspace versions, the Gmail
  inbox and the tools rail

The first list is shared with the rest of the team. The second is yours
alone until the shared-sync work lands.
