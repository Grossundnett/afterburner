## P0 — Broken. Fix before anything else.

### 1. Save day discards unadded activity data
DATA LOSS. Type a run into the activity fields, press "Save day" instead of
"Add activity", and the typed values vanish.

Fix: if the activity fields hold data when "Save day" is pressed, save the
activity too. Don't warn, don't discard — just save it. I press Save day
expecting everything on screen to be saved.

### 2. Gym sessions can't be logged properly
A permanent distance field on a gym activity, and nowhere for sets, reps or
weight. I'm currently dumping exercises into the notes box.

Minimum fix now: hide distance and pace when sport is gym or yoga. The full
sets/plans model (ARCHITECTURE.md §6) is P1, not now.

### 3. Sport list is rigid
No walking. And sport is a check constraint, so every new sport needs a
migration. The right question isn't "which sports do I add" — it's "why can't
I add one myself".

Fix: make it user-extensible. Lookup table, or drop the constraint and
validate in-app. Seed with walk, pace-walk, tennis, football alongside the
existing six. SKETCH THIS ONE FIRST — it touches the schema.

### 4. 24-hour clock
Times display and input as 24h throughout.

### 5. In-app date navigation
I'm editing the URL by hand to move between dates. Add previous/next day
controls on /log, and the same on /days.

---

Order: 1, then 2, then sketch 3 and wait for my OK, then 4 and 5.
Follow the token budget in AGENTS.md — skip sketches for anything under
~20 lines. Commit each item separately. Update BUILD.md.
