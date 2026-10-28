# What to do next (George)

## NEW (2026-10-28): load the pitch location data for the at-bat features

Why: "Play the at-bat" and the matchup replay need, for every pitch in the league, where it crossed the plate, how it moved, how fast it was, who was batting, the count, and what the batted ball did. We store only 13 coarse zones today. I checked a live Savant file: every column below exists, and 47 of 54 fouls in a sample day carry launch angle, so pop fouls and line fouls can be told apart.

1. **Run the SQL.** Supabase, SQL Editor, New query. Paste the contents of `supabase/migrations/20261030100000_pitch_events_location.sql` and press Run. It only adds empty columns and two indexes. Nothing is deleted or changed.
2. **Reload the 2026 season** (this fills the new columns for pitches already stored; it takes a while, about a 10 second pause between weekly chunks). In Terminal, in the project folder:

   `bash scripts/backfill_statcast.sh 2026-03-25 2026-10-27`

   It asks for pybaseball (`pip3 install pybaseball --break-system-packages` if it complains). For each chunk it prints 5 sample rows and waits 5 seconds, so you can press Ctrl+C to stop. Check the sample rows show numbers for `plate_x`, `pfx_x`, `balls`, `strikes`, `stand`. Re-running is safe: it updates rows in place.
3. **Tell Claude "location data is loaded."** It will check the row counts and then build the features (it will not build them before the data is there).

The nightly job that already loads yesterday's games will fill the new columns from tomorrow on, with no change to its schedule.

---


Written 2026-10-27. Do these in order. Each step says why.

## 1. Run the follow table SQL in Supabase (needed for /me and the Follow buttons)

Why: `/me` and every Follow button save players in a table called `player_follows`. It does not exist yet, so Follow cannot save and the Players list on `/me` stays empty. (Checked live: the table returns 404.)

1. Open Supabase, then your project, then **SQL Editor**, then **New query**.
2. Paste this and press **Run**:

```sql
create table if not exists player_follows (
  subscriber_id uuid not null references subscribers(id) on delete cascade,
  player_id     integer not null,
  player_name   text not null,
  created_at    timestamptz not null default now(),
  primary key (subscriber_id, player_id)
);

create index if not exists player_follows_subscriber_idx on player_follows (subscriber_id);
```

3. Tell Claude "player_follows is done" and it will check the table exists.

(The same SQL is in `supabase/migrations/20261026100000_player_follows.sql`.)

## 2. Set ASK_COOKIE_SECRET in Vercel (needed for "N of 5 left today" for signed-out visitors)

Why: signed-out visitors are counted with a signed cookie. Without the secret the page still shows "5 lookups a day" but cannot count what is left.

1. Open Vercel, then the project, then **Settings**, then **Environment Variables**.
2. Add `ASK_COOKIE_SECRET`. Value: any long random string (at least 16 characters; 40+ is better). In Terminal you can make one with: `openssl rand -base64 32`
3. Tick **Production** and **Preview**. Save.
4. Redeploy (Deployments, then the latest, then the three dots, then Redeploy) so it takes effect.

Do not paste the secret into chat or commit it.

## 3. Push the latest commit to production

The `/me` rebuild, the real wording (no more "[George: ...]" text) and the always-visible Ask the stats allowance are committed on `audit-snapshot` as `a7b9050`, but not pushed.

Tell Claude "push it" and it will push `audit-snapshot` and update `main`. Production deploys from `main`.

## 4. Check these on the live site after the deploy

- `/ask` (Ask the stats), signed out: shows "N of 5 left today" (or "5 lookups a day..." until step 2 is done).
- `/ask`, signed in on a free account: "N of 10 left today".
- `/ask`, Pro: "Pro: unlimited lookups".
- `/me`, signed in: follow a player from his page, then check he appears with last game, what changed and next game. Press Unfollow and check he goes.
- Scout Report tabs (Leverage, ABS, Fielding, Base running, Tendencies, Club) on a phone. The mobile layout has not been checked yet.

## 5. Decisions only you can make

- **Refund wording on /pricing.** I wrote: "If something is not right with your subscription, email cgomerford@gmail.com and we will look at it. You can cancel at any time from your page, and Pro stays open until the end of the period you have paid for." Check it matches what Stripe actually does, or give Claude your real refund terms.
- **About page.** I removed the bracket asking how you describe your data science background, so it now reads "I work with data for a living,". Change the wording if you want to be more specific.
- **Follow storage.** `/me` uses the existing `player_follows` table and `subscribers.teams`. If you want the single `follows` table from your brief instead, tell Claude and it will write that migration.
- **Headshots and logos.** `/me` uses them, because your standing rule is to keep them site-wide. If you want initials and text chips only, tell Claude.

## 6. Still open from earlier (no rush)

- Run the `nightly-pitcher-workload` GitHub workflow once so postseason pitch counts backfill.
- Decide whether the Batting Lab member tabs (spray, swing, contact, outcomes, platoon, approach) should cost the daily deep look.
- Player Splits tab: the "High leverage" and "2-out RISP" rows are probably always empty, because MLB does not publish those split codes for 2026. Ask Claude to fix it when you want.
