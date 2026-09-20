# Afterburner

Personal multi-sport training tracker — running, cycling, swimming, gym, body
metrics, and a discipline layer built around wake time.

**Read `ARCHITECTURE.md` for the full spec** (data model, integrations, design
tokens). **Read `BUILD.md`** for the ordered build steps and where we currently
are.

## How to work with me

Work in small, reviewable increments. One concern per commit.

Before writing code for a new module, state the approach in 3-4 lines and wait
for my confirmation.

After each file, explain in plain language what it does and why this approach
over the obvious alternative.

Never introduce a library without saying what it replaces and why.

No placeholder, stub, or TODO code. If something can't be built yet, say so and
stop.

If a library's current API differs from what you remember, say so rather than
guessing — I would rather check the docs than debug a hallucinated signature.
This applies especially to `@supabase/ssr`, whose API has changed recently.

Don't build ahead. If a step in `BUILD.md` says one form, build one form — not a
dashboard, not navigation, not charts. Scope creep here is the main risk to this
project shipping.

## Non-negotiables

- Enable RLS on every table in the same migration that creates it.
- Never hardcode a user id. Every query filters by the authenticated user.
- Server Actions are not separate routes — a proxy matcher that skips a path
  also skips Server Actions on it. Every Server Action must check auth itself.
  RLS is the backstop, not the only line.
- A control the server render depends on must not live inside the form that
  submits it. If changing it should load different data, it belongs in its own
  `method="get"` form that navigates. Otherwise the page keeps showing the old
  data under the new selection, and submitting writes one record's values onto
  another. Reconciling the mismatch at write time is a patch over a structural
  bug: the screen still lies even once the write is safe.
- Colours come from CSS variables in `globals.css`. Never inline a hex value.
- Server Components by default. `"use client"` only where interactivity requires
  it.
- Secrets live in env vars. Never commit `.env.local`. Never send a
  `service_role` key to the browser.
- Store distance in metres and duration in seconds. Convert at the UI boundary
  only.
- Zero is not blank, except where zero is impossible. Distance, duration and
  weight treat a typed `0` exactly like an empty field — both mean "not
  recorded", so both store null. A count where zero is a real observation must
  store the zero instead: `reps = 0` on a failed set is data, not absence.
  Confusing the two either rejects a legitimate entry or silently discards a
  meaningful one.
- Mobile-first. I will use this on my phone more than my laptop.

## Stack

Next.js App Router · TypeScript · Tailwind · Supabase (Postgres, Auth, RLS,
Realtime) · Vercel · Recharts

## Context

Solo project, single user for now, but multi-tenant-ready by design — every
table carries `user_id` and RLS enforces isolation in the database rather than
the application. It also doubles as a portfolio piece, so architectural
decisions should be defensible and worth explaining in a README.