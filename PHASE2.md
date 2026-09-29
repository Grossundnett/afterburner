# Afterburner — Phase 2 Backlog

Derived from one month of real logging (Sept–Oct 2026). This is the gate output:
friction found by use, not by design. Numbers in brackets map to the original
notes.

---

## P0 — Broken. Fix before anything else. (~90 min)

These cost data or make daily logging painful right now.

### 1. Save day discards unadded activity data [6]
**Data loss.** Type a run into the activity fields, press "Save day" instead of
"Add activity", and the typed values vanish. The two-form split fixed
duplication but created this.

Fix: if the activity fields hold data when "Save day" is pressed, save the
activity too. Alternatively warn before discarding. Do not silently drop it.

### 2. Gym sessions can't be logged properly [15]
A permanent distance field on a gym activity, and nowhere for sets, reps or
weight. Exercises are currently being dumped into the notes box.

Fix, minimum: hide distance and pace when sport is `gym` or `yoga`. Full fix is
the `plans`/`sets` model in ARCHITECTURE.md §6 — that's P1, but hiding the
irrelevant field is a 10-minute change that helps immediately.

### 3. Sport list is rigid [7, 16]
No walking. And `sport` is a `check` constraint, so every new sport needs a
migration. The right question isn't "which sports do I add" — it's "why can't I
add one myself".

Fix: move sports to a lookup table with a seeded default set, or drop the check
constraint and validate in the app against a user-extensible list. Seed with
walk, pace-walk, tennis, football alongside the existing six.

### 4. 24-hour clock [14] — **closed, no code**
Display was already 24h: Postgres returns `HH:MM:SS` and both pages slice to
`HH:MM`, which is 24-hour by construction.

Input is a native `<input type="time">`, whose picker follows the browser and OS
locale. **HTML and CSS cannot override it.** Forcing 24h there would mean a
custom control, which means client JavaScript and losing the native mobile time
spinner — a bad trade for a formatting preference.

Resolved by setting the phone and Windows to 24-hour time.

### 5. In-app date navigation [12]
Currently editing the URL by hand to move between dates. `/log` has the GET
form; add previous/next day controls, and the same for `/days`.

---

## P1 — The dashboard. This is Phase 2 proper. (1 weekend)

### 6. Trend charts [2, 11]
- Weight over time — the single most requested
- Wake and sleep times as a line chart, with the 07:00 target band
- Running pace and distance over time
- Contribution grid (ARCHITECTURE.md §4) — the GitHub-style day matrix

Weight daily [1] is already being logged; it just has nowhere to be seen.

### 7. Higher contrast, more energy [13]
The current palette is deliberately restrained. Raise contrast and let the sport
accents carry more weight. Stay within the §16 one-base-many-accents rule.

### 8. Desktop and mobile layouts [10]
Currently mobile-first only. Desktop should use the width — side-by-side panels
rather than one stretched column.

---

## P2 — Depth (Phase 3)

### 9. Gym templates [5]
Store the trainer's prescribed session once; weekly you tick what happened and
note only the weights that changed. ARCHITECTURE.md §6 has the schema.

### 10. Habits and custom activities [9]
A simple, user-extensible way to add things to track without code changes. Same
root as item 3 — the app shouldn't need a migration to learn a new word.

### 11. Streaks and the achievement ladder
Already specced in ARCHITECTURE.md §7 and §10. Weekly-unit streaks with pause
tokens.

---

## P3 — Integrations (Phase 4)

### 12. Google Calendar and Tasks [4]
Bidirectional. Schedule a session in Afterburner, it appears in Calendar; run it,
Strava reports it, the app closes the task. ARCHITECTURE.md §8.

### 13. Strava inbound
Auto-fills distance, duration and pace for runs, rides and swims. This is the one
that *removes* typing rather than adding a feature — worth doing first among the
integrations.

---

## P4 — Intelligence (Phase 5)

### 14. AI analysis of notes and blockers [3, 8]
Read the accumulated blocker codes and free-text notes, surface recurring
obstacles, suggest what to change. Needs three months of blocker data to say
anything true — which is why it's last.

---

## Open questions from use

**Duration input: decimal minutes or mm:ss?**
Deferred at Step 9. A month of logging should have answered it: are durations
read off a watch face (mm:ss wins) or estimated (one box wins)? Decide from
actual entries.

**Do the empty test rows matter?**
9 Sept and any other stray rows render as ordinary empty days. Harmless, but
worth deleting if they bother you.

---

## Non-fitness

### Spend tracker — separate domain, same app
A weekly expense tracker at `/spend`. Spec written separately.

**One decision to make deliberately:** the spec defines its own background,
surface, fonts and palette. ARCHITECTURE.md §16 says one constant base with only
`--accent` rebinding per route, precisely so the app reads as one thing. Two
different base palettes will read as two apps sharing a URL.

Either accept that (it is a genuinely separate domain) or keep Afterburner's base
and give Spend its own accent. Decide before building, not after.
