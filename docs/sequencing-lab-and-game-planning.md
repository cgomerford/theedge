# Sequencing Lab, x9Stuff Lab and the pitch data: what we have, and what it could do for game planning

Written 2026-10-29 for George. This describes what is built and stored today, what each screen answers, and what is missing, so you can decide how to use it for catcher and pitcher game planning. Everything below is checked against the code and the stored data as of the last reload (2026 season through 2026-10-27). Nothing in this file has been pushed to production yet.

---

## 1. The short version

We now hold every 2026 pitch with where it crossed the plate, how fast it was, how it moved, who threw it, who faced it, the count, and how it ended. On top of that we built:

1. **Sequencing Lab** (Labs menu, `/mlb/lab/sequencing`): how every pitcher sequences, with three views (Compare pitchers, Pitcher, League). The League view contains the **pitch finder**, where you choose a pitch and watch it, and **stack an at-bat** to find the real at-bats that match.
2. **x9Stuff Lab** (Labs menu, `/mlb/lab/stuff`, and the Stuff tab in each Pitching Lab pitcher page): an in-house pitch grade (Stuff) per pitcher and per pitch.
3. **Underneath both:** three precomputed stores so that the screens answer in milliseconds (section 3).

The core idea for game planning: **a pitch is described by its type, speed, movement and location. A sequence is pitches in order. We can now ask "what has happened, across the whole league, when a pitch like this was followed by a pitch like that", and see how those at-bats ended.** It describes what has happened. It does not predict.

---

## 2. What each screen does

### 2.1 Sequencing Lab → Compare pitchers
A table of every pitcher with six sequencing habits, each against the league:

| Column | Meaning |
|---|---|
| Repeats the pitch | next pitch is the same type as the last |
| Fastball, then slower | after a fastball, the next is not a fastball |
| Slower, then fastball | after a non-fastball, the next is a fastball |
| First-pitch fastball | fastball share of 0-0 pitches |
| Two strikes, not a fastball | share of two-strike pitches that are not fastballs |
| Most-used pitch | share of his pitches that is his top pitch |

Filters: hitter side (all, vs left, vs right), throwing hand, name. Orange = more than the league, blue = less; the league figure is on hover. A pitcher under **150 follow-up pitches** shows "Small sample" instead of rates (red `*`). "Fastball" means four-seam, sinker, cutter and the rare two-seam or generic fastball.

### 2.2 Sequencing Lab → Pitcher
One pitcher in full:
- **Transition grid:** each row is the pitch just thrown, each column is what came next, as a share of that row. "Against the league" colours it by how far he is from the league after that same pitch; "His shares" shows raw shares. Hover shows his count and the league share.
- **Count grid:** for each of the 12 counts (0-0 to 3-2), his pitch mix and the zone each pitch most often goes to.
- **Pitch explorer** (his own pitches, in thrown order): choose a pitch (spinning balls turn the way each pitch turns), click one of the 13 Statcast zones, choose a result and a count. It shows what he threw next and what he threw before in exactly that situation, where that pitch goes, what happened on it, and his real movement.
  - Still shown as "Pending" there: **Foul types** (pop foul, line foul) and **Exact location**. The data for both is now loaded (section 3), so they can be built.

### 2.3 Sequencing Lab → League
- **Pitch finder** (new). Choose:
  - pitch type (10 types), pitcher hand, batter side;
  - speed, arm-side break and induced rise (sliders that start at the league average for that pitch);
  - a zone (click), and a result (ball, called strike, swinging strike, foul, in play a hit, in play an out).
  It plays that pitch from behind the plate, landing on the result you chose, and shows what has happened to league pitches like it (a result bar with counts and sample size).
  - **"Like it"** means the same type, within **±1.5 mph**, **±3 inches** of arm-side break and **±3 inches** of induced rise.
  - The flight path is **drawn**, not recorded: both ends are measured (average release point and plate crossing of the matching pitches), the curve between them is the measured break bending the ball back. The page says so.
  - **Begin from a pitcher's pitch (optional):** search a pitcher, press one of his pitches (for example "Four-seam 96.9 mph +9 / +17") and the finder jumps to that pitch, hand and sliders.
- **Stack the at-bat** (new). Press "Put this pitch in your at-bat" to build a sequence of up to **6 pitches** in the order thrown. It then shows:
  - how many real 2026 at-bats match, and a bar of how they ended (strikeout, walk, hit by pitch, single, double, triple, home run, out in play);
  - **what came next** after the stacked sequence (pitch types, or "the at-bat ended");
  - the **8 most recent** matching at-bats (date, pitcher, batter, a dot per pitch coloured by type and ringed by result, and the outcome);
  - **Play the at-bat** replays the stack pitch by pitch.
  - Two modes: **Starts the at-bat** (the stack is the first pitches) or **Anywhere in the at-bat** (those pitches back to back at some point). Each at-bat counts once. The pitcher hand and batter side must match. A match under **15** at-bats shows "Small sample".
- **League matrices:** every pitcher's follow-up pitches added together (501,237 follow-ups) as "what comes after each pitch", and the league mix in each count.

### 2.4 x9Stuff Lab and the Pitching Lab Stuff tab
- **Stuff Grade v1.0** on a 100 scale (100 = league average, 10 points = one standard deviation; the loader adds 50 to the model's 50-based grade). Per pitcher (830) and per pitch type (3,910 rows).
- Real today: Stuff Grade, arsenal (usage, speed, induced rise, arm-side break, spin), movement against the league, **expected runs saved per 100 pitches** from the stuff (positive = better for the pitcher), ERA / xERA / K-BB%, and a "how this pitch has ended" tree (take / swing, then called strike, ball, whiff, foul, in play by batted-ball type) from the stored pitches.
- **Pending** (shows an honest "Pending" block until a full pitch model writes it): **Command**, **Overall**, the six sub-grades (miss bats, chase, steal strikes, ground balls, pop-ups, weak contact), actual run results by pitch, and the **pressure profile** (high-leverage versus normal). The full model file (`edge_pitch_model.py`) does not exist in the repo yet.
- Leaderboard and "How we grade" live on the full lab page. The Pitching Lab Stuff tab shows one pitcher and links to it.

### 2.5 Adjacent things that already exist (not part of this build)
Pitching Lab: Arsenal, Location Lab, Hot Zone Overlay, Shape, Sequencing, H2H, Trends. Scout Report tabs: Leverage, ABS (umpire-aware challenges), Fielding, Base running, Club/form/park, Tendencies. The game page also has batter zones, spray charts and a batter attack-plan card. These are separate from the Sequencing Lab and are **not joined to it**: the finder does not know a named hitter's weaknesses. Check each before relying on it for planning.

---

## 3. The data underneath (so you know what is real)

| Store | What it holds | Size | Used by |
|---|---|---|---|
| `pitch_events` | one row per pitch: game, at-bat, pitch number, pitcher id, batter id, pitch type, speed, effective speed, spin, extension, release x/z, plate x/z, strike-zone top/bottom, arm-side and vertical break (`pfx_x`, `pfx_z`), 13-zone code, description (the call), events (the at-bat result), balls, strikes, outs, inning, batter side, pitcher hand, launch speed and angle, batted-ball type, estimated wOBA, wOBA value | 728,088 pitches, 2026 (plate location on 725,374) | everything below is built from it |
| `pitcher_pitch_sequencing`, `pitcher_count_tendency` | per pitcher and hitter side: transitions after each pitch, pitch mix and top zone per count | per pitcher | Compare, Pitcher, League matrices |
| `league_pitch_bins` | every pitch grouped into small cells (type, hand, batter side, zone, speed to the mph, break and rise to 2 inches, result) with counts and sums | 347,248 cells from 724,761 usable pitches | the pitch finder |
| `league_ab_index` | every at-bat as one compressed file (pitch type, speed, break, rise, zone and result per pitch, plus pitcher, batter, date, hand, side and the at-bat result) | 186,644 at-bats, 725,374 pitches, about 4.3 MB | the stacked at-bat search (matched in server memory, a few milliseconds) |
| `stuff_lab_*` | Stuff Grade v1.0 per pitcher and per pitch type | 830 and 3,910 rows | x9Stuff Lab and the Stuff tab |

Why precompute: counting directly over 728,000 pitches timed out the database, so the finder and the at-bat search read small summaries that scripts build (`scripts/build_league_pitch_bins.py`, `scripts/build_league_ab_index.py`). **They are rebuilt by hand after new pitches load; they are not on a schedule yet.**

Definitions used everywhere:
- **Result classes:** ball (includes hit by pitch and pitchouts), called strike, swinging strike (includes foul tips and missed bunts), foul, in play a hit, in play an out.
- **Arm-side break** is positive toward the pitcher's arm side (a right-hander's is the negative of Statcast's `pfx_x`). **Induced rise** is positive up. Both in inches, the same way the Pitching Lab shows them.
- **Zones:** Statcast's 13 zones from the catcher's view. 1-9 are the strike zone (5 is the middle); 11 up and in, 12 up and away, 13 down and in, 14 down and away are the chase corners.
- **Small sample:** shown as "Small sample (n = X)" with a red `*`; thresholds are in `src/lib/min-sample.ts` (15 pitches for a zone cell, 100 for a Stuff grade, 150 follow-ups for a sequencing rate).

---

## 4. A real example of what it returns

Right-handed pitcher, any batter, speed 95 mph, +8 in arm-side, +16 in rise (a typical four-seam), tested on the real 2026 data:

| Stack | At-bats matched | How they ended |
|---|---|---|
| Fastball first (mode: starts the at-bat) | 10,580 | 23% strikeout, 9% walk, 13% single, 4% double, 3% home run, 46% out in play; next pitch a fastball 37% of the time |
| Fastball, then slider | 301 | 24% strikeout, 12% walk, 45% out in play, 18% hit (5 home runs) |
| Fastball, slider, then a fastball in zone 5 | 7 | too few to read: shown as "Small sample" |

This is the shape of the evidence: the more specific the stack, the fewer at-bats, and the sample size is always on screen.

---

## 5. Questions it can already answer (descriptive)

Pitcher or pitching coach:
- What does this pitcher throw after a fastball, in a 1-2 count, against right-handed batters, compared with the league?
- Does he repeat a pitch more or less than the league? Does he go fastball-to-offspeed more?
- Where does each pitch go in each count (13 zones)?
- If I throw this kind of fastball then this kind of slider, what has happened across the league, and how did those at-bats end?
- What pitch has followed that sequence most often?
- Which of his pitches grade best (Stuff), and how does each move compared with the league average for that pitch?

Catcher or analyst:
- For a given two-pitch opening, how often did the at-bat end in a strikeout versus a walk versus a hit?
- Which sequences end the at-bat soonest, and which ones keep going?
- How does a pitcher's habit differ from the league's after the same pitch (the "against the league" grid)?

These all describe what has happened. On the site, wording stays "what has happened against pitches like it" (never "what will happen"); banned words are in `scripts/checks/copy-lint.ts`.

---

## 6. What it cannot do yet (the gaps that matter for game planning)

1. **No named hitter in the search.** The finder is league-wide, split only by batter side. The at-bat index already stores each at-bat's batter id, so "at-bats against this hitter" or "against hitters like him" can be added, but it is not built, and one hitter's sample will usually be small.
2. **No pitcher filter in the search.** The index stores the pitcher id, so "his sequences versus the league's for the same stack" is possible but not built.
3. **No count in the search.** The raw pitches have balls and strikes, but the finder's summary and the at-bat index do not carry them (the count can be rebuilt from the order of calls, as the Pitcher view does). So "after 0-1, fastball then slider" is not possible yet.
4. **No value attached to a sequence.** The at-bat result is a category. The raw pitches carry estimated wOBA, wOBA value, launch speed and angle, but they are not in the index, so we cannot yet say a sequence is worth more runs than another, only how often each ending happened.
5. **No game state.** Inning and outs are stored per pitch; runners on base are not. Leverage is not in the search.
6. **Nothing catcher-specific.** The catcher is not stored on a pitch, so there is no framing, no pitch-calling by catcher, and no intended target (public data has only where the pitch ended).
7. **No hitter profile joined in.** A hitter's chase, whiff and damage by pitch type and zone are shown elsewhere (Scout Report, Batting Lab) but not combined with a sequence.
8. **No tunnelling or deception measure.** Release point, extension and plate crossing are in the data, so how alike two pitches look out of the hand and how far apart they finish could be computed, but it is not.
9. **One season.** 2026 only (regular season and postseason as stored); no multi-year view. Specific hitters and sequences get small quickly.
10. **Foul types and exact-location panels** in the Pitcher view are placeholders; the data exists now.
11. **Stuff model is partial.** Command, Overall, sub-grades and pressure are pending.
12. **The path animation is a drawing** from measured ends and measured break, not a tracked flight.

---

## 7. Ideas to take away (not built, for you to shape)

- **Pitcher plan page:** pick the opposing lineup, and for each hitter show his zones and pitch-type results next to the pitcher's own best sequences and the league evidence for those sequences.
- **Catcher view:** the same, framed as "what has followed pitch X against this type of hitter, and how did the at-bats end", with the sample size on every line.
- **Named-hitter and named-pitcher filters** in the stack (gaps 1 and 2) are the quickest next step because the index already holds both ids.
- **Count and value in the index** (gaps 3 and 4) turn "how often" into "how well".
- **A short sequence "playbook":** save a stacked at-bat and share it as a card (the graphics studio exists).

Please decide first which of these answers the question a catcher or pitching coach would actually ask before a game, then we build only that.

---

## 8. Status and housekeeping

- **Built and committed, not pushed to production:** Sequencing Lab (all three views, finder, stacking, pitcher picker), x9Stuff Lab and the Pitching Lab Stuff tab, the 2026 pitch data reload.
- **SQL you must run before the new pieces work live:** `supabase/migrations/20261030140000_league_ab_index.sql` (the at-bat index table). Already run: the pitch columns, the Stuff Lab tables, and the pitch-bins table.
- **Then Claude runs** `python3 scripts/build_league_ab_index.py --season 2026` to fill it.
- **Refresh after new pitches load:** re-run `scripts/build_league_pitch_bins.py --season 2026` and `scripts/build_league_ab_index.py --season 2026` (a few minutes each). Not on a schedule; a scheduled run would need a new cron, which you have asked not to add without saying so.
- **Access:** Sequencing Lab and x9Stuff Lab need a free sign-up (not Pro). The Pitching Lab Stuff tab sits inside the Pitching Lab Pro tabs.
- **Product rules that apply to anything built from this:** no prediction or betting language; empty state over made-up numbers; the sample size beside every figure; Red Hat Display only; the raw Edge Score is never shown.


---

## 9. Second Look and Game Plan Card (added 2026-10-29)

Two new sections inside the Sequencing Lab (one pill row across the top: Pitch sequencing | Second Look | Game Plan Card). The Labs menu keeps one "Sequencing Lab" entry listing all five tabs, and the MLB game page has a "Game Plan" tab that opens that game's card.

**Second Look** (`/mlb/lab/sequencing/second-look`): what happened the next time a hitter saw the same pitcher in the same game. Choose the pitcher's hand, the batter's side, how the first at-bat ended (strikeout, walk, hit, out in play) and the pitch that ended it. It shows how often the second at-bat opened with that same pitch (against the first pitch of every plate appearance for that hand and side), how both groups of second at-bats ended, and the five most recent real pairs. League view needs a free account; "This pitcher" and "This hitter" are Pro (the server sends nothing for them to anyone else). A group under 15 second at-bats shows "Small sample" and no rate. Filters are in the URL, so links can be shared.

**Game Plan Card** (`/mlb/lab/sequencing/game-plan`, one game at `/mlb/lab/sequencing/game-plan/[gamePk]`): for a probable starter, one line per hitter in the opposing lineup: first-pitch swing rate, opener (first two pitches, with the league endings of at-bats that open with pitches shaped like his), the two-strike pitch and its whiff rate, damage zones (3x3 from xwOBA on contact, by the league tertiles in the same zone) and the second look. Each line uses the hitter's own data when his sample is big enough, otherwise "hitters like him" (his cluster), otherwise "Small sample". A wristband view downloads as a PNG. Free account. It has three tabs in the site's own tab style: **Tonight's card**; **Build your own card** (reorder the lineup, take a hitter out, swap one in from the club's recent lineups, choose the columns, write a note on a hitter, see the pairs you saved from Second Look; your edits stay in that browser only, so they cost no database space); and **After the game: card vs what was thrown** (that game's stored pitches next to each hitter's line: first pitch swung or taken, the first two pitches against the card's opener, the two-strike pitches against the card's pitch, and how each plate appearance ended; the pitches load the morning after the game).

**Stored tables** (all written by manual scripts, one writer each): `league_pa_pairs` (66,047 pairs, looks 2 and 3), `second_look_summary` and `second_look_baseline`, `hitter_clusters` and `hitter_cluster_defs` (k = 8, 506 hitters, silhouette about 0.14 against right-handers and 0.11 against left-handers, so the groups overlap a lot), `game_plan_cards`. New `pitch_events` columns: `catcher_id`, `on_1b`, `on_2b`, `on_3b` (runner ids, blank = empty base), `delta_run_exp`, `times_through_order`.

**Rebuild commands, in order** (each prints a sample and waits 5 seconds before writing; run from the project folder with the venv Python):
1. `python3 scripts/fetch_statcast_events.py` (the nightly job already does this for yesterday)
2. `python3 scripts/build_league_pa_pairs.py --season 2026`
3. `python3 scripts/build_hitter_clusters.py --season 2026 --k 8` (add `--k-scan` first to see the silhouettes)
4. `python3 scripts/build_second_look_summary.py --season 2026`
5. `python3 scripts/build_league_ab_index.py --season 2026` and `python3 scripts/build_league_pitch_bins.py --season 2026` (the finder and the at-bat search)
6. `python3 scripts/build_game_plan_cards.py --date YYYY-MM-DD` (uses only pitches before that date; add `--game-pk N` for one game)
   **Back-dating:** the same script builds cards for games already played. `--date YYYY-MM-DD` for one day, or `--from YYYY-MM-DD --to YYYY-MM-DD` for a range (it reads the season once, then builds each date from only the pitches before it). A date that is already past is back-dated automatically and nothing from after it is used: the hitter groups are off, the league endings and Second Look counts are cut at the date, and the end-of-season Stuff grade is left off. The card says "Back-dated" and the Game Plan Card page has a date picker, day-before and day-after links, and a row of dates that have cards. A date with no cards shows an empty state (an admin also sees the command to run). Only the dates you have built can be opened; the page never builds one itself, because building reads the whole season.

**What a nightly schedule would need (not added):** the pitch load runs at 11:00 UTC (`nightly-statcast-events.yml`), so everything above would follow it: pairs, then clusters (weekly is enough), then the summary, then the index and bins, then the cards for the day's games after lineups are posted (a second run later in the day would swap "recent lineup" for the posted lineup). Rough run times on this machine: pairs 4 minutes, clusters 5, summary 3, index 3, bins 5, cards about 10 per run because the script reads the whole season (it could be changed to read once and build every game). The database has a statement timeout, so deletes are done in small pieces. Each would need its own workflow and, per the project rules, a note in both `vercel.json` and `.github/workflows/`.

**Known limits:** the hitter groups are weak (low silhouette); only about half of hitters meet every minimum for a group; looks 4 and later are not stored; "Play a pair" steps through a pair pitch by pitch (type, zone, result) but does not draw the flights, because a pair holds no speed or break; "Add to a Game Plan Card" saves a pair in the browser for Build your own card; two-strike n is swings (the rate's denominator), not pitches; swaps in Build your own card use the stored lines and recompute nothing; NFL was removed from the site on 2026-10-29.
