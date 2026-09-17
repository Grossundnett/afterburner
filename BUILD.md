# Afterburner — Build Guide

Companion to `ARCHITECTURE.md`. Phase 1 in full, with prompts.

## Where we are

**5 of 11 steps fully done** (0, 1, 2, 3, 4). **1 partially done** (5).
**5 not started** (6, 7, 8, 9, 10).

**Step 5 is half finished.** Every dashboard — Google Cloud, Supabase — is
configured. **No auth code exists.** Nothing in `src/` does sign-in, and the app
still cannot log anybody in.

**Next action:** the code half of Step 5 — `/login`, `/auth/callback`, a
sign-out action, route protection in `src/proxy.ts`, and the signed-in email on
the home page.

**Realistically ~3 hours of build time left in Phase 1**, against the original
4.5 hour estimate:

| Remaining | Minutes |
|---|---|
| 5. Google OAuth — code half only, dashboards done | 30 |
| 6. Schema and RLS | 30 |
| 7. Day log form | 60 |
| 8. List view | 30 |
| 9. Ship and verify | 20 |
| 10. Set the gate | 5 |
| | **~2 hr 55 min** |

That assumes nothing fights back. Step 5 is the step most likely to overrun,
because three systems have to agree on URLs and the errors are misleading.

| | |
|---|---|
| Local path | `C:\Users\vinay\dev\afterburner` |
| Repo | `github.com/Grossundnett/afterburner` (private) |
| Live URL | `https://afterburner-two.vercel.app` |
| Supabase ref | `ijnemkslclmpjhewydkk` (South Asia, Mumbai) |

### Three files belong in the repo root

They are separate documents and `AGENTS.md` references the others by name.

| File | What it is |
|---|---|
| `ARCHITECTURE.md` | The spec — 16 sections, diagrams, schema, design tokens |
| `BUILD.md` | This document — ordered steps and prompts |
| `AGENTS.md` | Ground rules for Claude Code (Step 2) |

---

## Phase overview

| Phase | What | Time | Gate to pass first |
|---|---|---|---|
| **1. Foundation** | Auth, schema, one form, one list, deployed | ~3-4 hrs | — |
| **Gate** | **Use it for three weeks. Write no code.** | 3 weeks | Phase 1 deployed |
| **2. Dashboard** | 7-day grid, Panel, trends, sport tabs | 1 weekend | 3 weeks of real data |
| **3. Depth** | Plans and sets, streaks, ladder, races, honesty panel | 1-2 evenings | Phase 2 in daily use |
| **4. Integrations** | Strava webhooks, Google Calendar/Tasks, sharing, realtime, CI | 1 weekend | Phase 3 stable |
| **5. Intelligence** | LLM layer over blocker history | later | 3+ months of blockers |

**The gate is the most important row in this table.** Phase 2 designs a dashboard around data you don't have yet. Three weeks of logging tells you which fields you actually skip and which you wish existed. Building the dashboard first means guessing, then rebuilding.

---

## Standing items

Not steps. Infrastructure that outlives Phase 1 and must not be forgotten.

| Item | Status | Notes |
|---|---|---|
| **Keep-alive workflow** | ✅ Done | `.github/workflows/keep-alive.yml`. Mondays and Thursdays plus manual `workflow_dispatch`. Supabase pauses Free Plan projects after ~7 days without database activity, and the three-week logging gate is exactly when that bites. |
| Keep-alive: point at a real table | ⬜ At Step 6 | It currently pings the PostgREST root because no tables exist yet. Supabase measures *database* activity, so once the schema lands, change the URL to `/rest/v1/days?select=id&limit=1`. |
| GitHub disables cron on idle repos | ⚠️ Watch | Scheduled workflows are switched off automatically after 60 days with no repository activity. During a long gate, check the Actions tab occasionally, or push something. |
| Vercel environment variables | ⬜ Verify | `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` must exist in the Vercel dashboard, not just `.env.local`. Missing them is the most common first-deploy failure. |

---

# Phase 1 — Foundation

**Definition of done:** a live URL, Google login working, one real day of your own data stored in Postgres, viewable on your phone. It should look bad. That is fine.

---

## Step 0 — Accounts and environment ✅ DONE

Browser work, before the editor.

- [x] **Node 20+** — confirmed v24.14.1
- [x] **GitHub** — private repo `Grossundnett/afterburner`, created empty
- [x] **Supabase** — org created, project `afterburner`, region South Asia (Mumbai), automatic RLS enabled
- [x] **Vercel** — signed up via GitHub, Hobby (free) plan
- [x] **Google Cloud Console** — project `afterburner` created (ID `afterburner-508712`). Done at Step 5, see that section for the full configuration record.

### Values to keep in a scratch file

Create a plain text file somewhere outside the repo. You will paste these into
`.env.local` at Step 4.

```
SUPABASE_URL=https://ijnemkslclmpjhewydkk.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE=          <- Settings > API Keys, do not share
PROJECT_REF=ijnemkslclmpjhewydkk
DB_PASSWORD=                    <- from your password manager
```

**Security note.** The publishable/anon key is designed to be visible in browser
code — exposure is expected and harmless because RLS does the real
authorisation. The `service_role` key and the database password are the
opposite: `service_role` **bypasses RLS entirely**. Never commit either, never
paste them into a chat, never send them to the browser. If one leaks, rotate it
in the Supabase dashboard immediately.

You will not need `service_role` at all in Phase 1. Save it and forget it.

---

## Step 1 — Scaffold and deploy an empty app

**Why deploy before building anything:** you want the whole pipeline — laptop to
GitHub to Vercel to a live URL — verified while there is nothing in it that could
have broken. If you build for three hours and *then* deploy, every failure is
ambiguous.

### 1a. Scaffold ✅ DONE

```powershell
mkdir C:\Users\vinay\dev\afterburner
cd C:\Users\vinay\dev\afterburner
npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir --use-npm
```

The `.` means "scaffold into the current folder" — it only works if the folder is
empty.

### 1b. Push to GitHub ✅ DONE

```powershell
git add -A
git commit -m "chore: scaffold"
git branch -M main
git remote add origin https://github.com/Grossundnett/afterburner.git
git push -u origin main
```

`create-next-app` initialises git and makes the first commit itself, so
`git commit` may report "nothing to commit." That is expected, not an error.

### 1c. Deploy to Vercel ✅ DONE

1. vercel.com, signed in with GitHub
2. Plan screen: **Hobby** (free). Team name: `afterburner`. Continue.
3. **Add New → Project**
4. Find `afterburner` in the repository list → **Import**
5. Vercel auto-detects Next.js and fills in every setting. **Change nothing.**
6. **Deploy**

Takes one to two minutes. You get a URL like `afterburner-xxxx.vercel.app`.

**Gate: open that URL on your phone and confirm the default Next.js page loads.**
Do not proceed until it does. Everything after this assumes a working deploy.

✅ Passed — live at `https://afterburner-two.vercel.app`, status Ready, loads on
phone. **Save this URL** — Step 5 needs it for the Supabase redirect allow-list.

Ignore Vercel's Production Checklist (custom domain, analytics, Speed Insights).
None of it applies to a personal app with one user.

*Hobby plan terms cover non-commercial use — fine for a personal tracker and for
showing recruiters. Charging for it would need Pro.*

### Environment gotchas hit along the way

Recorded because they will recur.

| Symptom | Cause | Fix |
|---|---|---|
| `npx : running scripts is disabled on this system` | PowerShell execution policy blocks `.ps1`, and npm ships as one | `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`, or use Command Prompt instead |
| `name can no longer contain capital letters` | `create-next-app` takes the package name from the folder; npm forbids capitals | Use an all-lowercase folder path |
| `cannot access the file because it is being used by another process` | VS Code holds a lock on its open workspace folder | Close VS Code, or work in a different path |
| `Permission denied (publickey)` on `ssh -T git@github.com` | No SSH key registered on this machine | Use the HTTPS remote instead — Git Credential Manager opens a browser login. Set up SSH another day |
| `warning: LF will be replaced by CRLF` on every `git add` | `core.autocrlf=true` on Windows, with no `.gitattributes` to override it | Commit `.gitattributes` with `* text=auto eol=lf`. Fixed before Step 4 |
| `.env.example` silently never gets tracked | `.gitignore` has `.env*`, which matches the example file as well as the secret one | Add `!.env.example` on the line *after* it. Fixed before Step 4 |
| Google sign-in returns access denied, and it looks like a bad redirect URI | The consent screen is in **Testing** publishing status, which only admits accounts on the test-user list | Add the Google account under Audience → Test users. Chase this *before* re-checking redirect URIs — the error does not say the account is the problem |
| Google rejects the callback URL in **Authorised JavaScript origins** | That field accepts an origin only — scheme, host and port, never a path | Leave JavaScript origins empty. The callback URL belongs in **Authorised redirect URIs** alone |

---

## Step 2 — Set the ground rules for Claude Code (10 min) ✅ DONE

**Why this comes before any feature code:** these rules govern every prompt that
follows. Setting them after the first module means the first module doesn't
follow them.

`create-next-app` already generated an **`AGENTS.md`** at the repo root — that is
the newer cross-tool convention and Claude Code reads it. **Put the content below
into `AGENTS.md` rather than creating a separate `CLAUDE.md`.** One file, no
duplication, no risk of the two drifting apart.

```markdown
# Afterburner

Personal multi-sport training tracker. See ARCHITECTURE.md for the full spec.

## How to work with me

Work in small, reviewable increments. One concern per commit.

Before writing code for a new module, state the approach in 3-4 lines and
wait for my confirmation.

After each file, explain in plain language what it does and why this approach
over the obvious alternative.

Never introduce a library without saying what it replaces and why.

No placeholder, stub, or TODO code. If something can't be built yet, say so
and stop.

If a library's current API differs from what you remember, say so rather than
guessing — I would rather check the docs than debug a hallucinated signature.

## Non-negotiables

- Enable RLS on every table in the same migration that creates it.
- Never hardcode a user id. Every query filters by the authenticated user.
- Colours come from CSS variables in globals.css. Never inline a hex value.
- Server Components by default. `"use client"` only where interactivity requires it.
- Secrets live in env vars. Never commit .env.local.

## Stack

Next.js App Router · TypeScript · Tailwind · Supabase (Postgres, Auth, RLS)
· Vercel · Recharts
```

Also copy `ARCHITECTURE.md` and this build guide into the repo root. Claude Code
reads them as context, which is why the prompts below can be as short as they are.

**Prompt:**

```
Read AGENTS.md and ARCHITECTURE.md in the repo root.

Summarise back to me in under 150 words: what we're building, the stack,
and the three constraints you'll be holding yourself to. Don't write any
code yet.
```

That first prompt is a cheap check that it actually ingested the spec. If the
summary is vague or misses the non-negotiables, it didn't properly read the
files — far cheaper to discover now than at Step 7.

Then commit and watch Vercel rebuild automatically off the push. That is your CI
loop working:

```powershell
git add -A
git commit -m "docs: architecture, build guide, agent rules"
git push
```

---

## Step 3 — Design tokens (10 min) ✅ DONE

**Why now, with nothing to style:** theming applied later means touching every
component that already exists. Defining six CSS variables while there are zero
components costs four minutes. Doing it at Phase 2 costs an afternoon.

The palette itself is in `ARCHITECTURE.md` §16 — one constant dark base, with
only `--accent` rebinding per sport.

**Prompt:**

```
Set up the design tokens from ARCHITECTURE.md section 16 in
src/app/globals.css.

Define the base variables (--bg, --surface, --surface-2, --border, --text,
--text-muted) on :root, and the per-sport accent overrides as
[data-sport="..."] blocks.

Apply --bg and --text to the body. Add a mono font with tabular figures
for numerics — suggest one and tell me why before adding it.

Then update the default page to show a single card using the card pattern
from section 16: muted 13px label above, 36px mono value below. Hardcode
the value for now, it's just to verify the tokens render.

Show me the CSS before writing it.
```

Commit. Push. Check the live URL again.

---

## Step 4 — Supabase client wiring (30 min) ✅ DONE

> **Built as `src/proxy.ts`, not `middleware.ts`.** Next.js 16 deprecated the
> `middleware` file convention and renamed it to `proxy`; the exported function
> is `proxy` too. `middleware.ts` still runs but warns on every build. Supabase's
> own AI-prompt page still shows the old name and contains a broken import
> (`next/handlers` instead of `next/headers`) — their main server-side guide is
> the one that is current. Verified the `setAll` signature and `getClaims`
> against the shipped type definitions in `node_modules` rather than the docs.

**What this step does:** gives your app three ways to talk to Supabase — from the
browser, from Server Components, and from middleware that keeps the login session
alive. No user-visible feature comes out of it. It is plumbing for Step 5.

**Prompt:**

```
Wire up Supabase using @supabase/ssr for Next.js App Router.

I need:
- a browser client
- a server client for Server Components and Route Handlers
- middleware that refreshes the auth session on each request

Before writing anything: tell me the current recommended pattern for
@supabase/ssr with the App Router, and flag anything you're unsure about
so I can check the docs. This API changed recently and I'd rather verify
than debug.

Also create .env.example listing the required variables with placeholder
values, and confirm .env.local is gitignored.
```

### Then wire the environment

1. Create `.env.local` in the repo root with your Supabase URL and publishable key
   from the Step 0 scratch file.
2. ✅ Already handled — `.gitignore` covers `.env.local` via `.env*`, and the
   `!.env.example` negation on the next line keeps the example file trackable.
3. Add the same two variables in Vercel: **Project → Settings → Environment
   Variables**.

**Item 3 is the one people skip.** Forgetting the Vercel environment variables
produces a working localhost and a broken production build — the single most
common first-deploy failure. Do it now while the values are in front of you.

---

## Step 5 — Google OAuth (40 min) 🟡 MANUAL CONFIG DONE, CODE NOT STARTED

**The fiddliest step in Phase 1, and most of it is clicking, not coding.** Three
systems have to agree with each other: Google issues the credentials, Supabase
holds them and does the token exchange, your app redirects to the right place.
When it fails it is almost always a URL mismatch between those three.

This is where you finally need the Google Cloud project from Step 0.

**In Google Cloud Console:**
0. If you haven't yet: console.cloud.google.com → project dropdown → New Project → name it `afterburner`
1. APIs & Services → OAuth consent screen → External → fill the minimum, add yourself as a test user
2. Credentials → Create OAuth client ID → Web application
3. Authorised redirect URI — your actual value:
   `https://ijnemkslclmpjhewydkk.supabase.co/auth/v1/callback`

**In Supabase:** Authentication → Providers → Google → paste client ID and secret → enable.
Under URL Configuration, add **both** of these to the redirect allow-list:
- `http://localhost:3000/**`
- `https://afterburner-two.vercel.app/**`

Missing the second one is why login works locally and fails in production.

### ✅ What is already configured — do not redo this

All three dashboards are set up. Recorded here so it does not get repeated.

| Where | Setting | Value |
|---|---|---|
| Google Cloud | Project name | `afterburner` |
| Google Cloud | Project ID | `afterburner-508712` |
| Google Cloud | Consent screen | External, publishing status **Testing** |
| Google Cloud | Test users | Two personal Gmail accounts added |
| Google Cloud | OAuth client name | `afterburner-web`, Web application |
| Google Cloud | Authorised redirect URI | `https://ijnemkslclmpjhewydkk.supabase.co/auth/v1/callback` |
| Google Cloud | Authorised JavaScript origins | **Left empty, deliberately** |
| Supabase | Google provider | Enabled, client ID and secret pasted |
| Supabase | URL Configuration | Site URL plus both redirect URLs set |

Two things here are worth remembering rather than rediscovering, and both are in
the gotchas table above:

**Testing publishing status only admits listed test users.** Any other Google
account gets an access-denied screen that reads like a redirect-URI problem. If
sign-in fails for an account, check the test-user list before touching URLs.

**Authorised JavaScript origins rejects paths.** It takes an origin only, so
pasting the callback URL there fails validation. It stays empty — Supabase does
the token exchange server-side, so the browser never needs a registered origin.

### ⬜ What is left — the code half

Nothing in `src/` exists for auth yet. Still to build: `/login`,
`/auth/callback`, a sign-out action, route protection in `src/proxy.ts`, and the
signed-in email shown on the home page.

**Prompt:**

```
Add Google sign-in using Supabase Auth. The provider is already configured
in the Supabase dashboard.

Build:
- /login — a single "Continue with Google" button, styled with our tokens
- /auth/callback — the code exchange route handler
- a sign-out action
- middleware protecting every route except /login and /auth/callback,
  redirecting unauthenticated users to /login
- the authenticated user's email shown somewhere on the home page

Explain how the session is stored and refreshed, and where the middleware
sits in the request lifecycle. I want to understand this part properly
rather than just have it work.
```

Test locally, then deploy and test on the live URL. **Do not move on until login works in production.**

---

## Step 6 — Schema and RLS (30 min)

**Why the SQL is written out rather than prompted for:** row-level security is
easy to get subtly wrong in a way that looks fine until it isn't, and generated
policies routinely omit the `with check` clause. This is the one part of Phase 1
worth reading line by line rather than trusting.

Run it in the Supabase dashboard: left sidebar → **SQL Editor** → New query →
paste → Run. Then save a copy in your repo at
`supabase/migrations/0001_init.sql` so the schema is version-controlled even
though you applied it by hand.

```sql
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  height_cm int,
  wake_target time not null default '07:00',
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now()
);

create table days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  wake_time time,
  sleep_time time,
  blocker_code text,
  blocker_note text,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  sport text not null check (sport in
    ('run','ride','swim','gym','yoga','other')),
  distance_m int,
  duration_s int,
  avg_pace_s_per_km int,
  perceived_effort int check (perceived_effort between 1 and 5),
  source text not null default 'manual',
  external_id text,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);

create table body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  weight_kg numeric(5,2),
  bio_score numeric(5,2),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index on days (user_id, date desc);
create index on activities (user_id, date desc);
create index on body_metrics (user_id, date desc);

alter table profiles     enable row level security;
alter table days         enable row level security;
alter table activities   enable row level security;
alter table body_metrics enable row level security;

create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own days" on days
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own activities" on activities
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own body metrics" on body_metrics
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

Two notes worth understanding rather than copying:

**`unique (user_id, source, external_id)`** is what stops Strava re-imports duplicating rows in phase 4. Cheap now, painful to add once you have data.

**`with check` as well as `using`** — `using` controls which rows you can read and update; `with check` controls what you're allowed to write. Omitting `with check` lets you insert rows belonging to someone else. This is the most common RLS mistake.

**Prompt:**

```
I've applied supabase/migrations/0001_init.sql in the Supabase dashboard.

Generate TypeScript types from the schema into src/lib/database.types.ts
and add an npm script to regenerate them.

Then write me a short test I can run manually to prove RLS is working:
something that attempts to read another user's rows and fails. Explain
what it proves.
```

---

## Step 7 — The day log form (60 min)

**The core of Phase 1, and deliberately minimal.** One form, one date, a handful
of fields. No week grid, no charts, no navigation. Those come in Phase 2 once
three weeks of real use has told you what they should contain.

Give the two prompts below separately, not together — the second builds on the
first and reviewing them one at a time is the whole point of the ground rules in
Step 2.

**Prompt:**

```
Build the day logging form at /log.

Fields:
- date (defaults to today)
- wake time, sleep time — both optional, time inputs
- blocker (select, optional) with these values, plus a free-text note when
  "other" is chosen:
  work_ran_late, slept_late, woke_late, unwell, rain, travel, itf_event,
  social, scrolling, no_energy, gym_crowded, other
- notes (textarea, optional)
- weight in kg (optional)

Behaviour:
- upsert on (user_id, date) so re-submitting a date edits rather than
  duplicates
- weight writes to body_metrics, not days
- use a Server Action, not a client-side fetch
- validate with zod on the server
- on success, show a confirmation and clear the form

Style with our tokens. Mobile-first — I'll use this on my phone more than
my laptop.

Describe your approach to the upsert and the two-table write before you
start coding.
```

Then, separately:

```
Add an activities section to /log. Below the day fields, let me add any
number of activities for that date.

Each activity: sport (run/ride/swim/gym/yoga/other), distance in km,
duration in minutes, notes. Store distance in metres and duration in
seconds — convert at the boundary, and tell me where you're putting the
conversion.

Compute avg_pace_s_per_km on save when both distance and duration exist.

Adding and removing rows before submit should not require a page reload.
```

---

## Step 8 — The list view (30 min)

**Why a list and not a dashboard:** you need to see that your data persisted and
edit it when you get something wrong. That is all. A dashboard built now would be
designed around imagined data.

**Prompt:**

```
Build /days: the last 30 days, newest first.

One row per day showing date, wake time, sleep time, activity count with
sports, weight if logged, and blocker if set. Days with no entry appear as
empty rows so gaps are visible.

Each row links to /log?date=YYYY-MM-DD to edit it.

Server Component, single query where possible — tell me if you need more
than one and why.

Make the home page redirect to /days for now.
```

---

## Step 9 — Ship and verify (20 min)

**Verify in production, on your phone, not on localhost.** Phone is where you will
actually log, and production is where the environment variables differ.

```bash
git add -A
git commit -m "feat: phase 1 — auth, schema, day logging"
git push
```

Then, on your phone, on the live URL:

- [ ] Log in with Google
- [ ] Log today: wake time, sleep time, one activity, weight
- [ ] See it in /days
- [ ] Edit it and confirm no duplicate row appears
- [ ] Log out and back in, data still there

**Phase 1 is done.** It looks bad. That was the plan.

---

## Step 10 — Set the gate

**This is the most important step in the document and the easiest to skip.**

Add to your calendar, three weeks out: *"Afterburner phase 2 — review what I actually logged."*

Between now and then: log every day, change nothing. Keep a running note of every moment you think "I wish this did X." That note is the phase 2 spec, and it will be better than anything either of us could design today.

---

## If you get stuck

**Deploy works locally but not on Vercel** — environment variables aren't set in the Vercel dashboard. Most common phase 1 failure.

**OAuth redirects to the wrong place** — the redirect allow-list in Supabase URL Configuration needs both localhost and the production URL.

**Queries return empty despite rows existing** — RLS is on and `auth.uid()` is null, meaning the server client isn't reading the session cookie. Check the middleware.

**Claude Code writes 400 lines when you asked for 40** — stop it, point at AGENTS.md, ask it to redo the step in increments. Letting this slide once sets the pattern for the whole project.

**Claude Code can't find ARCHITECTURE.md** — it's a separate file from BUILD.md. Both go in the repo root.

---

## Time budget

| Step | Minutes |
|---|---|
| 0. Accounts ✅ | 20 |
| 1. Scaffold and deploy ✅ | 25 |
| 2. Ground rules ✅ | 10 |
| 3. Tokens ✅ | 10 |
| 4. Supabase wiring ✅ | 30 |
| 5. Google OAuth 🟡 dashboards done, code not started | 40 |
| 6. Schema and RLS | 30 |
| 7. Day log form | 60 |
| 8. List view | 30 |
| 9. Ship and verify | 20 |
| | **~4.5 hrs** |

Spent so far: about 1 hr 35 min across steps 0-4, plus the Step 5 dashboard
work. **Remaining: roughly 3 hours.** See "Where we are" at the top for the
per-step breakdown.

If you run short, **steps 1 through 6 are the real evening.** Auth plus schema plus a deployed URL is a genuine milestone; the form can be tomorrow. Stopping there is a good outcome, not a failure.