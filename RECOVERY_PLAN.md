# AMQ+ Recovery Plan

**Status: fulfilled (2026-08-10).** Branch `amq-plus-recovery` completed Phases 0–3.
Leftovers that need a human (R5 repro, R16 in-game sample points) are tracked in
`docs/REMAINING.md` — not blockers for merging this branch.

Compiled 2026-08-07 from:

- Discord `#AMQ+ script questions/bug reports` — old channel (`1452371956337737981`, 473 msgs, 2026-03-05 → 2026-07-20) and new channel (`1528763486241558678`, 252 msgs, 2026-07-20 → 2026-08-07), including attached screenshots.
- Source read of `src/`, `amqPlusConnector.user.js` (v1.3.0), `supabase/migrations/`.
- Live queries against the production Supabase project `jszhqqbeekxnaxgdnyyc` (`amq-plus`).

Everything below marked **[verified]** was confirmed against code or production data, not inferred from the chat alone.

---

## 0. Production snapshot

| Table | Rows |
|---|---|
| `training_progress` | 145,054 (180 users, 451 quizzes) |
| `training_session_plays` | 649,639 |
| `training_sessions` | 21,481 |
| `quiz_configurations` | 684 |
| `song_lists` | 384 (40 with >3000 songs) |
| `training_tokens` | 220 |

Health signals:

- **65,911 of 145,054** progress rows (45%) are past due.
- **8,832** rows are shelved (due ≥ 2090) — the "Start Fresh" parking lot.
- **7,130** rows are `is_active = false`.
- **65** orphan rows have `song_ann_id IS NULL` (3 quizzes; 30 + 30 + 5).
- **213** distinct `song_ann_id`s in `training_progress` do not exist in `masterlist.json` → these are the "Missing from database" rows users keep reporting.
- Last 7 days: **907 sessions**, of which **260 (29%) contained zero due songs** and **394 (43%) were padded with not-yet-due "revision" songs**.

---

## 1. What users are actually experiencing

Ranked by how many people reported it and how much it hurts.

### 1.1 "Start Training" spins ~15s, then resets — no error (worst, most-reported)
Reported by 3shine (Mar 24, Apr 25, May 1, May 23, Jul 28), Cherryish (May 26), Ikunobu (Jul 30), ragondin, SirG., arkanazz (Jul 3), zCrimlet (Aug 2).
3shine clicked ~200 times over a day without a single successful start. Console shows only
`[AMQ+ Training] Starting session with quizToken: … sessionLength: 5` repeated, no error.

Cherryish's console capture is the smoking gun:

```
Failed to load resource: the server responded with a status of 524 ()
Song generation error: SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

zCrimlet's "recreate the song list under a brand-new name" workaround made it vanish for 3shine ("worked on the first try", "close to zero loading wait now"). The name is a red herring — see 2.1/2.2.

### 1.2 Due counts never move / songs due tomorrow play today
Ikunobu (Aug 6–7): "I've played 2×50 rounds, got about 80 right, but it still shows the same exact number for due today"; "looked at a specific song, it is marked for playing in 2 days, but it's playing right now"; "why website shows we are on Aug 6th but playing songs for Aug 7th".
Screenshot: every row `LAST ATTEMPT 2026-08-06 / NEXT REVIEW 2026-08-07`.
Same class: 3shine (May 25) "played my review songs, due count stayed the same"; arkanazz 800+ backlog; 3shine 508 due; Ikunobu stuck at 224.

3shine's community workaround — "switch to 95% due / 5% new in advanced settings" — is people routing around a server bug.

### 1.3 Shelved songs are a one-way trip
zCrimlet (Aug 4): "the 'Rescue Shelved' button is nowhere to be found… currently it won't play those songs ever… only ~20 unlock per day… clearing data for hundreds of songs just to get it sounds ass".
3shine and Ikunobu had 15–400 songs stuck at review date 2099; 3shine deleted history to escape.
The confirmation dialog literally promises the button:

> "You can restore review dates anytime using the **'Rescue Shelved'** button."

### 1.4 Quiz creation broke on AMQ's community-quiz update (Aug 6) — patched, one piece left
peashooter posted the new payload shape, Cherryish shipped a client-side patch (`connectUp`, `ruleBlockRandomOrder`), 4lajf fixed it server-side the same day. **Still outstanding:** sample points. Cherryish, Aug 6:

> "could you also add something to make the samples work again? the format for each block rn is:
> `{connectUp: false, samplePoint: {samplePoint: 12}, annSongId: 1897}`
> `{connectUp: false, samplePoint: {samplePoint: [7, 40]}, annSongId: 25199}`"

Originally flagged Jul 20 by Cherryish: "training mode no longer samples for you (and it also doesn't work if you try to set a custom sample)". Her screenshot shows the per-song sample column empty (`⧗ -`) while the rule block header shows `0-100`.

### 1.5 Deletes fail intermittently
3shine (May 7): "Failed to delete play records", "I also can't delete test quizzes". Cherryish (May 7): "I've been having issues with deleting quizzes/play records as well". SirG.: "i just spam till it works". 3shine (May 8): "spamming delete on all the songs at once somehow ended up working — like 5 errors 1 success".

### 1.6 Song lists vanish (Pixeldrain)
Cherryish (May 1) — list permanently corrupted, 4lajf: "the saved list for this ID seems to be corrupted… probably there is not much i can do about it". doomchicken + Cherryish (May 4): "well all my lists are dead now". Again Jun 2, Jun 6. Cherryish asked twice for an export feature; still none.

### 1.7 AnisongDB outage takes the site down with it
Jul 30: AnisongDB SSL failure → Ikunobu couldn't create song lists or start training at all; Cherryish couldn't load from MAL or AniList. Users with pre-built saved lists were unaffected. Also May 29, Jun 25.

### 1.8 "Missing from database"
Continuous, from March to August. ragondin (Jul 26, song 49259), SirG. (two long lists, ~40 IDs), Tugia, Cherryish, TriusHalf, Ikunobu, doomchicken, Qoya, 3shine (May 7: "the quiz says it's missing from the db, but I see it in anisongdb").

### 1.9 Playlist desync — one song silently skipped, every later guess shifts by one
ragondin (May 10): "This song was loaded but never actually played… Because of that, when I was supposed to guess this song, another song was displayed instead. So basically all my guesses after that point were shifted by one song… now some of my saved guesses are partially wrong."
arkanazz hit the same on Jul 17. **This silently corrupts training data**, which is worse than any crash.

### 1.10 Quiz-builder semantics nobody understands
- Routes/RNG pick **one** path per generation, not the union — Swapin, arkanazz (gave up after 3 days), Voltaeyx, Peps, Cherryish all hit this. arkanazz: "I still don't know why 2k songs are missing".
- Franchise Size `Min` is displayed but not enforced — 4lajf confirmed in-thread (Jul 5).
- Popularity filter returns ~500 songs, SirG. expected far more.
- Two "Songs & Types" blocks → can't save when changing total song count (Cherryish, Jul 1).
- Adding a source selector to a filter node → "having trouble generating songs" (Cherryish, Jul 1).
- SirG. (Jul 5): 100-song quiz "just generates a random pool size" each time.
- Muenstier: wants to disable the AMQ+ lobby UI override.

### 1.11 Feature requests (recurring, cheap wins)
- Suspend / mark-mastered a song from the rating popup or training table — lng, doomchicken, Cherryish, 3shine, TriusHalf. Currently the only route is building a negative song list by hand.
- Bulk select + bulk act in the `/training` table (Cherryish).
- Search by anime name in the training tab (Cherryish, Mar 19; 4lajf: "possibly").
- Show FSRS difficulty and the next interval on each rating button (TriusHalf, Jul 25).
- One-click "add this song to an AMQ+ song list" from inside the game (3shine, 4lajf).
- Export song lists (Cherryish, May 5 — directly motivated by 1.6).
- Quiz merge should mark merged songs as discovered in the target quiz — 3shine, Mar 5. 4lajf shipped a fix the same day; 3shine retested and reported **it still didn't work**. Never revisited.

---

## 2. Root causes — verified

### 2.1 [P0] Connector auth is an O(n) bcrypt scan on every request **[verified]**

`src/lib/server/training/training-utils.js:26-39` hashes tokens with `bcrypt`, cost 10. Seven endpoints then do this:

```js
const { data: tokens } = await supabaseAdmin.from('training_tokens').select('*');
for (const dbToken of tokens || []) {
  if (await verifyToken(token, dbToken.token_hash)) { validToken = dbToken; break; }
}
```

Call sites: `training/quiz/[quizId]/stats/+server.js:43`, `training/session/start/+server.js:78`,
`training/session/[sessionId]/complete/+server.js:26`, `training/session/[sessionId]/progress/+server.js:45`,
`training/token/validate/+server.js:28`, `training/[quizId]/progress/+server.js:35,103`,
`training/import-with-quiz/+server.js:107`.

There are **220 rows** in `training_tokens` and the query doesn't even filter `revoked = false`. bcrypt cost 10 ≈ 60–100 ms per compare, and they run **sequentially**. Average 110 compares → **7–11 s of pure CPU per API call**; worst case 220 → **~20 s**. This runs on session start, session complete, quiz stats, *and on every single song rating*.

This explains almost everything in 1.1:

- The ~15 s "thinking" before the button resets — that is the bcrypt loop.
- Why it degrades over time (220 tokens today, far fewer in March).
- Why it is **per-user deterministic**: a user whose row sorts early is fast forever, one that sorts late is slow forever. 3shine "2 of my ~10 quizzes always fail, the rest never do" = constant ~10 s auth + variable generation time, tipping over the limit only for the bigger pools.
- The 524: Cloudflare's origin timeout is 100 s; auth burns 10–20 s of it before generation even starts.

bcrypt is the wrong primitive here. Tokens are `crypto.randomBytes(32)` — 256 bits of entropy. Key-stretching protects low-entropy secrets; it buys nothing here and costs everything.

### 2.2 [P0] Large-pool generation exceeds Cloudflare's 100 s limit; the client can't tell **[verified]**

`Failed to load resource: … status of 524` + `SyntaxError: Unexpected token '<', "<!DOCTYPE "` = Cloudflare returned its HTML error page and the client called `JSON.parse` on it. Contributors:

- 2.1's 7–20 s auth tax.
- `src/lib/server/songFiltering.js:8` — `import masterlistData from './masterlist.json'`, a **157 MB** file, statically imported. Plus `working-titles.json` at 3.2 MB.
- Song lists live on Pixeldrain (`songFiltering.js:1881-1910`); a 4k-song list is a cold third-party fetch on every generation, no caching.
- Cherryish measured the cliff herself (May 27): "it seems like it's timing out once i reach around 4k songs", and "songs added using the 'upload solely annsongids' feature take significantly longer to load compared to using global search or json".

zCrimlet's "rename the list" cure is really "make a fresh, smaller Pixeldrain object that isn't cold" — it moved the request back under 100 s.

### 2.3 [P0] The daily due cap starves due songs and pads sessions with not-yet-due ones **[verified]**

`src/routes/api/training/session/start/+server.js:283-323`:

```js
const dailyDueCap = lastSession ? lastSession.total_songs : 20;   // ← cap == ONE session's length
…
remainingDueCapacity = Math.max(0, dailyDueCap - dueScheduledToday);
```

`dueScheduledToday` sums `composition.due` across **all** of today's sessions. So the total number of due songs you may review in a day equals the length of your last session. Play one 50-song session and your remaining due capacity for the rest of the day is **0** — regardless of a 500-song backlog.

`fsrs-service.js:410-478` then fills the empty slots with `getSongsNeedingRevision()`, i.e. songs **due in the future**. Those get rated, and `scheduleNext` (`fsrs-service.js:137-146`) bumps any same-day-or-earlier result to **tomorrow 04:00**. Result: a treadmill where the same songs are re-reviewed daily, "tomorrow" never shrinks, and the real backlog is untouched.

Production evidence, last 7 days: **260 / 907 sessions (29%) had `composition.due == 0`**; **394 (43%)** contained revision filler; average session 43.8 songs but only 28.7 due.

This is exactly 1.2. It also explains why experienced users (3shine, Cherryish) drifted to **advanced/manual mode** — manual mode never computes `remainingDueCapacity`, so it bypasses the cap entirely. The community discovered the workaround before anyone found the bug.

Secondary: the "auto" cap is also why arkanazz went from a working set to 800+ due after one day of downtime and cannot dig out.

### 2.4 [P0] Shelved songs are unreachable in manual mode **[verified]**

`fsrs-service.js` — the `mode === 'auto'` branch populates `selectedShelved` (line ~452). The `else` (manual) branch, lines 497-566, **never touches `selectedShelved`**, and neither does its 4-step fill (extra due → extra revision → extra new). So the instant a user opens Advanced Settings, shelved songs become permanently invisible.

zCrimlet's screenshot is Advanced Settings open with 0/0/0. His report — "it just plays songs I already got on previous sessions today", "around 20 get unlocked each day" — is this plus the revision-refill loop from 2.3 handing him back songs he played an hour ago.

### 2.5 [P0] "Rescue Shelved" does not exist **[verified]**

`src/routes/training/[quizId]/+page.svelte:1900` renders the promise. There is no endpoint (only `clear-due` = shelve, and `reset-due` = spread), and no button anywhere in `src/`. 8,832 rows are currently shelved across production with no supported way back.

### 2.6 [P1] Sample points — corrected diagnosis **[re-investigated 2026-08-07]**

The original entry claimed the payload was *malformed* because `samplePoint` only appeared on the rule block. That was wrong, and 4lajf's pushback was right: a real AMQ payload contains blocks **without** `samplePoint` (`{"connectUp":false,"annSongId":39865}`) alongside blocks that have it, so per-block `samplePoint` is an **override**, not a required field. AMQ accepts our payload; the rule-block value is stored and rendered (Cherryish's screenshot shows the rule-block header reading `0-100`).

What the code and production data actually show:

1. **Real encoding bug — fixed sample points go out as an array.** `resolveSamplePoint()` returned `[min, max]` unconditionally, so a *fixed* sample point of 20 was emitted as `[20, 20]`. Per Cherryish's Aug 6 spec, AMQ encodes fixed as a bare number (`{samplePoint: 12}`) and a range as a pair (`{samplePoint: [7, 40]}`). This is exactly her "it also doesn't work if you try to set a custom sample". Only 1 of 684 production quizzes uses a fixed point, which is why it went unnoticed for so long.
2. **The default path emits `[0, 100]`, which is well-formed.** 675 of 684 quizzes carry the default `{useRange: true, start: 0, end: 100}`, so `resolveSamplePoint` returned `[0, 100]` — correct shape. That leaves only one explanation for "training mode no longer samples for you": since Jul 20 AMQ plays the **per-block** value and a block without one does not inherit the rule block at play time (it renders as `⧗ -` in the sample column — Cherryish's screenshot).
3. **`resolveSamplePoint` was reading a shape it never receives.** `simulateQuizFromRoutes` → `resolveBasicSettings` → `extractBasicSettingsDisplay` hands it a *display value* (`{kind: 'range', min, max}` / `{kind: 'static', value}`), not the raw stored `{value: {useRange, start, end, staticValue}}`. The `value?.useRange` / `value?.start` branches were dead on that path; it worked by accident via `config?.kind === 'range'`. Both callers (`session/start/+server.js:114` and `play/[quizId]/+server.js:148`) go through `simulateQuizFromRoutes`, so both were affected identically.

**Fix shipped:** `resolveSamplePoint` now returns `{isRange, min, max}` and handles both shapes explicitly; `toAmqSamplePoint` picks scalar-vs-array; every block gets `samplePoint: {samplePoint: <scalar|[min,max]>}`; the rule-block `[min, max]` is kept for backwards compatibility (`amqPlusConnector.user.js:6045` and `:7819` still read it). Covered by `tests/quizCommandBuilder.test.js` as a contract test so the next AMQ format drift fails there rather than in the Discord thread.

**Still needs a live check — this is the one open item in Phases 0–2.** Point 2 is inference from Cherryish's screenshot plus the timing, not a direct observation of AMQ's play engine. Stamping per-block is correct either way (it is an override that now matches the rule-block value), but confirm sampling actually works in-game before announcing it.

Everything checkable without AMQ has been checked: `tests/quizCommandBuilder.test.js` asserts the emitted payload matches Cherryish's Aug 6 spec exactly for both encodings (`{samplePoint: 12}` fixed, `{samplePoint: [7, 40]}` range), on every block, for both the display and raw stored input shapes. What cannot be asserted from here is what AMQ's player does with it. That needs a human in a lobby:

**In-game verification procedure**

1. Build (or pick) a training quiz with **≥ 3 songs of known length**, ideally a long OP/ED so an offset is obvious by ear.
2. In the quiz editor, set Sample Point to a **fixed** value well into the song — `50` is a good choice. Save.
3. Start a training session from the connector.
4. In the AMQ quiz creator, open the generated `AMQ+ <name>` quiz and look at the **per-song sample column**. It must show `50` on every row, not `⧗ -`. `⧗ -` means the per-block value did not land and the fix did not work.
5. Play the session. Each song must **start ~50% in**, not from the beginning. Listen to at least three; one could coincidentally sound right.
6. Repeat with a **range** — Sample Point `7`–`40`. The per-song column should show the range, and successive songs should start at visibly *different* offsets inside that window.
7. Negative control: set the range to `0`–`0` and confirm every song starts at the very beginning. If step 5 and step 7 sound identical, sampling is being ignored entirely and the diagnosis in point 2 is wrong.

If step 4 shows the value but step 5 plays from 0:00, the payload is right and the problem is on AMQ's side — capture the `load custom quiz` payload from the console and reopen with peashooter rather than changing `quiz-command-builder.js`.

Until steps 1–7 have been done by a human, do not claim 1.4 as fixed in the Discord thread. `docs/discord-announcement.md` is worded to ask Cherryish to confirm rather than assert it.

### 2.7 [P1] `training_session_plays` has no index for the delete path **[verified]**

Only index besides the PK: `idx_training_session_plays_session (session_id, played_at)`.
`src/routes/api/training/[quizId]/progress/song/+server.js` deletes with `.eq('user_id').eq('quiz_id').eq('song_ann_id')` → **sequential scan over 649,639 rows** per delete. That is 1.5.
3shine's "5 errors, 1 success, then everything worked" is a scan that occasionally lands inside the statement timeout and warms the cache.

### 2.8 [P1] N sequential round trips in the bulk-reschedule endpoints **[verified]**

`reset-due/+server.js` and `clear-due/+server.js` both end in:

```js
for (const update of updates) {
  await supabaseAdmin.from('training_progress').update({...}).eq('id', update.id);
}
```

416-song reset (zCrimlet's dialog) = 416 serialized round trips. For a 2,000-song quiz this cannot finish inside 100 s.

### 2.9 [P1] Masterlist is 2.5 months stale **[verified]**

`src/lib/server/masterlist.json` last written **2026-05-23**. It holds **38,066** unique `annSongId`s, max **49246**. Production `training_progress` references IDs up to **49839**.

Cross-referenced: **213 distinct `song_ann_id`s have training data but no masterlist entry.**
- **176** are ≥ 47000 → new uploads/seasonals; a masterlist refresh fixes all of them.
- **37** are genuine holes below 47000, and they match the community reports one-for-one:
  `1544, 5290, 7676, 11453, 11587, 13714, 16707, 22115, 22117, 23198, 24189, 24281, 24332, 24397, 25469, 29660, 39966, 41332, 44943, 45997, 46160, 46533, 46570, 46579, 46580, 46584, 46641, 46684, 46696, 46697, 46698, 46699, 46700, 46837, 46838, 46839, 46840`
  (7676 = Mina OP, 11587, 24281 = King of Prism Shiny Seven Stars OP2, 24332, 24397, 45997, 46570 — all reported verbatim in the thread.)

`npm run update:masterlist` exists (`scripts/update-masterlist.js`) but is manual and has not been run since May.

### 2.10 [P1] Pixeldrain is an unbacked single point of failure **[verified]**

`song_lists.songs_list_link` and `user_list_cache.{anime,songs}_list_link` are bare Pixeldrain URLs; `src/lib/server/pixeldrain.js` has no retry, no timeout, no fallback. All 384 song lists have a link and zero have local copies. One list is known permanently corrupted (4lajf, May 1: "could be some pixeldrain oopsie… if you would be in the process of saving the file while the server crashed it could end up as incomplete") — i.e. **writes are not atomic**.

### 2.11 [P1] Playlist desync corrupts saved guesses

Connector v1.3.0 already resolves by `annSongId` rather than raw index (`amqPlusConnector.user.js:10071-10130`, `findTrainingPlaylistIndexByAnnSongId`), so this looks fixed for anyone on current script. But: there is no server-side guard, and users on stale scripts keep writing shifted data. Needs (a) a version gate, (b) server-side rejection when the reported `annSongId` isn't in the session playlist.

### 2.12 [P2] Debug telemetry left in production **[verified]**

10 live `fetch('http://127.0.0.1:7242/ingest/2fbe1aae-…')` calls in
`src/routes/api/enrich-amq-export/+server.js` and `src/lib/utils/providerUtils.js`.
`providerUtils.js` is client-reachable — every user's browser is firing requests at their own localhost:7242.

### 2.13 [P2] RLS enabled, zero policies on all 11 tables **[verified]**

Every table has RLS on with no policy, so nothing is readable except via the service role. That is a coherent design (all access through server endpoints), but it means **every** authorization check is hand-written. Spot check found correct `quiz.user_id !== userId` guards in `reset-due`, `clear-due`, `progress/song`; the full set needs an audit. Also flagged: 11 functions with mutable `search_path`, and leaked-password protection disabled.

### 2.14 [P2] Data hygiene

- 65 `training_progress` rows with `song_ann_id IS NULL` (the only remaining duplicates — the `20260310000000_fix_training_progress_duplicates` unique index correctly excludes NULLs, so these slip through).
- 7,130 `is_active = false` rows with no retention policy.
- `training_session_plays` at 649k rows and growing ~15k/week, no pruning.

---

## 3. Fix plan

### Phase 0 — stop the bleeding (target: 1 day)

**0.1 Kill the bcrypt token scan.** Biggest single win; likely resolves most of 1.1 on its own.

```sql
-- supabase/migrations/20260807000000_token_lookup_hash.sql
alter table public.training_tokens add column if not exists token_sha256 text;
create unique index if not exists idx_training_tokens_sha256
  on public.training_tokens (token_sha256) where token_sha256 is not null;
```

Then in `training-utils.js` add `lookupToken(token)`:
1. `select * from training_tokens where token_sha256 = sha256hex(token) and revoked is not true` → one indexed row, ~1 ms.
2. Miss → fall back to the legacy bcrypt scan **once**, and on success write `token_sha256` (lazy backfill).
3. All new tokens write both columns.

Replace the loop at all 8 call sites. Drop `token_hash` after the backfill drains (add a metric for legacy-path hits).
Also filter `revoked` — the current query doesn't.

**0.2 Client must not `JSON.parse` an HTML error page.** In `amqPlusConnector.user.js`, before parsing, check `response.status` and `Content-Type`. On 5xx/524 show *"AMQ+ server timed out generating this quiz (pool too large). Try a smaller session or fewer sources."* Set an explicit `timeout:` on `GM_xmlhttpRequest` and add `ontimeout`. Bump the version and tell users to update.

**0.3 Fix per-song sample points** in `quiz-command-builder.js`:

```js
const [sMin, sMax] = resolveSamplePoint(bs.samplePoint);
const blocks = songs.map((song) => ({
  connectUp: false,
  samplePoint: { samplePoint: sMin === sMax ? sMin : [sMin, sMax] },
  annSongId: song.annSongId
}));
```
Keep the rule-block `samplePoint` for backwards compatibility. Verify against a real AMQ save before shipping.

**0.4 Add the missing index** (5 minutes, fixes 1.5):

```sql
create index concurrently if not exists idx_tsp_user_quiz_song
  on public.training_session_plays (user_id, quiz_id, song_ann_id);
create index concurrently if not exists idx_tsp_user_quiz
  on public.training_session_plays (user_id, quiz_id);
```

**0.5 Rip out the localhost:7242 telemetry** — 10 call sites, `providerUtils.js` + `enrich-amq-export/+server.js`.

### Phase 1 — the scheduler (target: 2–3 days)

**1.1 Replace the daily due cap.** `dailyDueCap = lastSession.total_songs` is not a review budget, it's an accident. Replace with a per-quiz `daily_review_limit` (default: unlimited; user-settable in the training settings dialog, Anki-style). Ship it defaulted to unlimited so every existing backlog immediately becomes reachable.

**1.2 Never pad with revision while due songs remain.** In `computeSessionPlaylist` auto mode, only fall through to `getSongsNeedingRevision()` after `availableDueSongs` is exhausted. This alone stops the "due tomorrow plays today, due today never moves" loop.

**1.3 Exclude recently-played songs from revision.** Add a `played_today` exclusion (from `training_session_plays`) to `getSongsNeedingRevision()` and `getShelvedSongs()`. Directly fixes zCrimlet's "it just plays songs I already got on previous sessions today".

**1.4 Include shelved songs in manual mode.** Add a shelved slot to the manual branch and to its fill chain (`fsrs-service.js:497-566`). Expose a "Shelved %" field alongside Due/New/Revision.

**1.5 Ship "Rescue Shelved".**
- New `POST /api/training/[quizId]/rescue-shelved` — takes rows with `due >= 2090`, redistributes them over N days using the same `computeSpread` logic as `reset-due`, sorted by stability.
- Wire the button into `training/[quizId]/+page.svelte` next to "Reset all review dates", visible whenever `shelvedCount > 0`, showing the count.
- Announce it in the Discord thread — zCrimlet, 3shine and Ikunobu all lost data working around its absence.

**1.6 Add a "Catch-up" preset.** One button: 100% due, 0 new, session length = min(backlog, 100). Codifies 3shine's 95/5 advice so people stop needing folklore.

**1.7 Bulk-update the reschedule endpoints.** Replace the per-row `await` loops in `reset-due` and `clear-due` with a single Postgres function taking `(user_id, quiz_id, jsonb[])`, or a chunked upsert (500/batch).

### Phase 2 — reliability (target: 1 week)

**2.1 Get song generation off the request path.** Even after 0.1, a 4k-song pool from a cold Pixeldrain fetch can exceed 100 s. Convert `POST /api/training/session/start` to:
`202 Accepted { jobId }` → connector polls `GET /api/training/session/job/[jobId]` → `{ status: 'pending' | 'ready' | 'error' }`.
The connector's status line already exists; it just needs to poll instead of block.

**2.2 Cache resolved song pools.** Key on `(quiz_id, config_hash, source_versions)`, TTL ~1 h, invalidate on quiz save. Turns repeat starts into milliseconds and removes most Pixeldrain traffic.

**2.3 Stop statically importing a 157 MB JSON.** `songFiltering.js:8` — move `masterlist.json` behind a lazily built, process-wide `Map<annSongId, song>` (or a Postgres `songs` table, see 2.5). Cold start and RSS both drop hard.

**2.4 Make song lists survive Pixeldrain.**
- Mirror every list into Supabase Storage (or a `song_list_items` table) on write; read Pixeldrain first, fall back to the mirror.
- Make writes atomic: upload → verify by re-reading → only then update `songs_list_link`. Fixes the corruption class 4lajf described.
- Ship the export button Cherryish asked for in May. Backfill all 384 existing lists into the mirror as a one-off job.

**2.5 Decouple from AnisongDB at play time.** The Jul 30 outage should never have blocked training. Persist enriched song metadata locally (a real `songs` table keyed by `annSongId` would replace both masterlist.json and the AnisongDB round trips), and serve stale-but-present data with a banner when AnisongDB is unreachable.

**2.6 Automate the masterlist refresh.** `npm run update:masterlist` on a weekly cron with a diff report. Ties into 2.5.

**2.7 Guard the playlist.** Reject `POST /session/[id]/progress` when the reported `annSongId` isn't in that session's playlist, and add a minimum connector version to the session-start response so stale scripts are told to update rather than silently writing shifted data.

### Phase 3 — the confusing parts (target: 2 weeks)

**3.1 Routes/RNG.** Five separate users burned days on this. Either:
(a) add a "combine all routes" toggle so multiple sources union as people expect, or
(b) at minimum, label it in the UI — "One route is chosen at random per quiz generation" — right on the node, plus a worked example in the docs. 4lajf's source-selector answer (Jul 1) is the correct pattern and is completely undiscoverable.

**3.2 Enforce Franchise Size `Min`**, or hide the field. Currently only `maxSelection` is read (4lajf, May 7: "the Min field is not actually enforced yet"). Silent no-ops in a filter UI destroy trust in every other filter.

**3.3 Fix multi-block save.** Two "Songs & Types" blocks + changing total song count → won't save (Cherryish, Jul 1). Allow multiple filters of the same category open at once — 4lajf already identified this.

**3.4 Popularity filter.** Explain `countValue` (default 500 = top-N *anime*, not songs) in the node UI. SirG.'s confusion was reasonable.

**3.5 Re-test quiz merge → discovered flag.** 3shine reported the March fix didn't land and nobody rechecked. Verify against `clone-training-data.js` / `training-utils.js:mergeProgress`.

**3.6 Suspend / mastered.** The single most-requested missing feature (lng, doomchicken, Cherryish, 3shine, TriusHalf, over five months). Minimum viable: an "Suspend" action in the rating popup + a bulk select in the `/training` table, writing `is_active = false` (the column already exists and is already excluded everywhere). Ship this and the negative-song-list folklore disappears.

**3.7 Small UI wins.**
- Search by anime name in the training tab (Cherryish, asked March).
- FSRS difficulty + next interval on the rating buttons (TriusHalf).
- Toggle to disable the AMQ+ lobby UI override (Muenstier).
- "Add to AMQ+ song list" button in the song-info area — 4lajf already scoped this on Mar 5.

---

## 4. Data migrations

Run in order. Take a `pg_dump` of `training_progress` + `training_session_plays` first.

**M1 — token lookup column** (Phase 0.1). Additive, zero downtime, lazy backfill. Drop `token_hash` only after legacy-path hits reach zero.

**M2 — indexes** (Phase 0.4). `CREATE INDEX CONCURRENTLY`, no lock.

**M3 — orphan progress rows.** 65 rows across 3 quizzes, all `song_ann_id IS NULL`, all inert (every read path filters them) but they inflate `totalSongs` and dodge the unique index.

```sql
delete from public.training_progress where song_ann_id is null;
-- optional, prevents recurrence:
alter table public.training_progress
  add constraint training_progress_song_ann_id_not_null check (song_ann_id is not null) not valid;
```

**M4 — masterlist refresh + missing-song reconciliation.**
1. `npm run update:masterlist` (pulls current AnisongDB). Expect the 176 IDs ≥ 47000 to resolve.
2. Re-run the diff; the ~37 sub-47000 IDs are real AnisongDB gaps. For those, either (a) hand-add entries from the metadata users already posted in the thread (SirG. and Tugia supplied full name+artist lists — reusable), or (b) mark them and show *"not in AnisongDB — this song cannot be played"* instead of the current alarming *"Please report this to 4lajf on Discord"*.
3. Keep `masterlist.backup.json` as the rollback.

**M5 — shelved-song amnesty.** Optional, but 8,832 rows are parked and users are deleting history to escape. Once "Rescue Shelved" ships (1.5), post in the thread and let people opt in per quiz. Do **not** bulk-rescue server-side — some users shelved deliberately.

**M6 — retention.** `training_session_plays` is at 649k and grows ~15k/week. Add a `pg_cron` job pruning plays older than 12 months (a `pg_cron` cleanup already exists for `user_list_cache`, so the pattern is in place). Same for `is_active = false` rows untouched for >12 months.

**M7 — song list mirror backfill** (Phase 2.4). One-off job over 384 lists: fetch from Pixeldrain, write to Supabase Storage, record the mirror URL. Expect a handful of failures — those are the already-corrupted ones; surface them to their owners rather than dropping them silently.

---

## 5. Suggested order of attack

| # | Work | Effort | Users it unblocks |
|---|---|---|---|
| 1 | Token lookup hash (0.1) | half day | everyone hitting 1.1 — 3shine, Cherryish, Ikunobu, zCrimlet, ragondin, SirG., arkanazz |
| 2 | Missing index (0.4) | 10 min | 1.5 — 3shine, Cherryish, SirG. |
| 3 | Per-song sample points (0.3) | 1 h | Cherryish (open since Jul 20) |
| 4 | Client error handling (0.2) | 1 h | everyone — turns silent failure into a message |
| 5 | Drop the daily due cap + no revision padding (1.1, 1.2) | 1 day | Ikunobu, arkanazz, 3shine |
| 6 | Rescue Shelved (1.5) | half day | zCrimlet, 3shine, Ikunobu — 8,832 parked rows |
| 7 | Shelved in manual mode + recently-played exclusion (1.3, 1.4) | half day | zCrimlet |
| 8 | Masterlist refresh (M4) | 2 h + runtime | ~10 reporters, 213 songs |
| 9 | Remove debug telemetry (0.5) | 15 min | every user's browser |
| 10 | Bulk-update reschedule endpoints (1.7) | half day | large-quiz owners |
| 11 | Async generation + pool cache (2.1, 2.2) | 3 days | large-quiz owners |
| 12 | Pixeldrain mirror + export (2.4) | 2 days | Cherryish, doomchicken — asked in May |
| 13 | Suspend/mastered (3.6) | 2 days | 5 requesters over 5 months |
| 14 | Route/filter semantics (3.1–3.4) | 1 week | Swapin, arkanazz, Voltaeyx, Peps, SirG. |

Items 1–4 are roughly a day of work and should visibly change the experience for nearly everyone in the thread. Worth posting in the channel when they land — the community has been self-supporting for five months (Cherryish shipped two hotfixes herself) and will retest immediately.

---

## 6. Things worth double-checking before writing code

- **Is `amqPlusConnector.linked.user.js` a build artifact?** It's untracked, 402 KB vs 440 KB for the main script. If it's generated, `.gitignore` it; if it's the shipped variant, wire it into a build step.
- **Which connector version are users actually on?** Several reported bugs (index desync 2.11, missing error messages) appear fixed in v1.3.0. Add version reporting to session start so you can tell "still broken" from "hasn't updated".
- **`tests/supabase-connection.test.js` and `tests/supabase-integration.test.js` are untracked** and `tests/mocks/env-*.js` are modified. Decide whether these land before touching the auth path — an integration test around token lookup would pay for itself during M1.
- **Confirm the AMQ payload shape against a live save** before shipping 0.3. peashooter's Aug 6 dump is the reference, but AMQ has changed this twice in three months (May 22 `guessModes`, Aug 6 `connectUp`/`ruleBlockRandomOrder`). Consider a contract test that fails loudly when AMQ's format drifts, so the next break is caught before the thread notices.
