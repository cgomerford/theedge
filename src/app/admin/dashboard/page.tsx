// src/app/admin/dashboard/page.tsx
//
// ADMIN DASHBOARD
//
// Internal-only. Guarded by middleware.ts (basic auth over /admin/*).
// Server component — fetches with the service-role client, passes only
// plain serialisable data down to the client SnipStudio / StatCardPanel.
//
// Optional query param for backfill / inspection:
//   /admin/dashboard?date=YYYY-MM-DD   (sets "today's slate"; perf = day before)
//
// REVISION NOTE (2026-06-24): initial build.
// REVISION NOTE (2026-06-24): added Player Stat Cards section — image
// export tool for player-level stats (streaks, ERA trends, H2H), separate
// from Snip Studio's team-level X-post drafts. Fetched outside the main
// Promise.all since getTodaysStatCardData fans out per-game roster +
// gamelog calls and is meaningfully slower than the other two queries;
// kept separate so a slow/failed card fetch can't block the rest of the
// page. See src/lib/admin-dashboard-cards.ts for the data layer.
// REVISION NOTE (2026-06-25): added Pre-Game Data Room section — rolling
// OPS/ERA/errors + rule-based "interesting takes" pulled straight from the
// MLB Stats API (no edge_predictions dependency, no new table). Unlike the
// stat cards, this one fetches CLIENT-SIDE and lazily per selected game
// (AdminDataRoomSection → /api/admin/data-room/[gamePk]) — a 15-game slate
// fanning out 6+ API calls per team isn't something the server render
// should ever wait on. See src/lib/pregame-stats.ts + pregame-takes.ts.

import {
  getDailyPerformance,
  getTodaysReads,
  buildSnips,
  etDate,
} from '@/lib/admin-dashboard'
import { getTodaysStatCardData } from '@/lib/admin-dashboard-cards'
import SnipStudio from '@/app/admin/dashboard/SnipStudio'
import StatCardPanel from '@/app/admin/cards/StatCardPanel'
import AdminDataRoomSection from '@/components/admin/AdminDataRoomSection'

export const dynamic = 'force-dynamic'

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date } = await searchParams
  const slateDate = date || etDate(0)

  // perf date = the day before the slate date
  const perfDate = (() => {
    const d = new Date(`${slateDate}T12:00:00`)
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  })()

  const [perf, reads] = await Promise.all([
    getDailyPerformance(perfDate),
    getTodaysReads(slateDate),
  ])
  const snips = await buildSnips(reads, perf)
  const cardData = await getTodaysStatCardData(slateDate)

  const fmtDate = (s: string) =>
    new Date(`${s}T12:00:00`).toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
    })

  return (
    <main className="admin">
      <style>{css}</style>

      <div className="wrap">
        {/* TOP BAR */}
        <div className="topbar">
          <div className="brand"><span className="mark">⊕</span> THE EDGE <span className="sub">/ admin</span></div>
          <div className="topmeta">Slate {fmtDate(slateDate)}</div>
        </div>

        {/* ── YESTERDAY ───────────────────────────── */}
        <section className="sec">
          <div className="sechead">
            <span className="glyph">§</span><h2>Yesterday&rsquo;s performance</h2>
            <span className="tag">{fmtDate(perf.date)} · internal</span>
          </div>

          {perf.graded === 0 ? (
            <div className="empty">No graded games for {fmtDate(perf.date)} yet — the grading cron may still be running.</div>
          ) : (
            <div className="yday">
              <div className="record">
                {perf.wins}–{perf.losses}
                <small>reads that aligned</small>
              </div>
              <div className="ydstats">
                <div className="stat">
                  <div className="n">{perf.alignment_percent != null ? `${Math.round(perf.alignment_percent)}%` : '—'}</div>
                  <div className="l">alignment (n={perf.graded})</div>
                </div>
                <div className="stat">
                  <div className="n">{perf.strong_hit} / {perf.strong_total}</div>
                  <div className="l">strong leans hit</div>
                </div>
                <div className="stat">
                  <div className="n">{perf.avg_factors_on_wins != null ? `${perf.avg_factors_on_wins.toFixed(1)}/8` : '—'}</div>
                  <div className="l">avg factors aligned on wins</div>
                </div>
                <div className="stat">
                  <div className="n">{perf.tossups}</div>
                  <div className="l">toss-ups (ungraded)</div>
                </div>
                {(perf.best || perf.worst) && (
                  <div className="extremes">
                    {perf.best && <div><span className="ok">BEST ⊕</span> {perf.best.matchup} {perf.best.factor_count}/8 — {perf.best.detail}</div>}
                    {perf.worst && <div><span className="miss">MISS ⊕</span> {perf.worst.matchup} {perf.worst.factor_count}/8 — {perf.worst.detail}</div>}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ── TODAY'S READS ───────────────────────── */}
        <section className="sec">
          <div className="sechead">
            <span className="glyph">§</span><h2>Today&rsquo;s reads</h2>
            <span className="tag">ranked by lean strength</span>
          </div>

          {reads.length === 0 ? (
            <div className="empty">No reads generated for {fmtDate(slateDate)} yet.</div>
          ) : (
            reads.map((r, i) => (
              <div key={r.game_pk} className={`read${i === 0 && !r.near_split ? ' top' : ''}`}>
                <div className="rank">{i + 1}</div>
                <div>
                  <div className="matchup">{r.matchup}</div>
                  <div className="submeta">
                    {i === 0 && !r.near_split && <span className="star">★ Edge of the Day candidate · </span>}
                    led by {r.dominant_factor}
                    {' · '}
                    {r.lineups_confirmed
                      ? <span className="lin-ok">✓ lineups confirmed</span>
                      : <span className="lin-wait">⧗ lineups pending</span>}
                  </div>
                </div>
                <div className="edge">
                  {r.factor_count}/8
                  <small>{r.lean_team}</small>
                </div>
              </div>
            ))
          )}
        </section>

        {/* ── PRE-GAME DATA ROOM ──────────────────── */}
        <section className="sec">
          <div className="sechead">
            <span className="glyph">§</span><h2>Pre-game data room</h2>
            <span className="tag">rolling stats · MLB Stats API · raw model OK here</span>
          </div>
          <AdminDataRoomSection
            reads={reads.map((r) => ({ game_pk: r.game_pk, matchup: r.matchup }))}
          />
        </section>

        {/* ── SNIP STUDIO ─────────────────────────── */}
        <SnipStudio snips={snips} />

        {/* ── PLAYER STAT CARDS ───────────────────── */}
        <section className="sec">
          <div className="sechead">
            <span className="glyph">§</span><h2>Player stat cards</h2>
            <span className="tag">image export · player-level, not model output</span>
          </div>
          <StatCardPanel data={cardData} />
        </section>

        <div className="footnote">
          ⊕ Internal tool — guarded, not indexed. The <b>Yesterday</b> box is your honest scoreboard (your eyes only).
          The <b>Pre-game Data Room</b> is raw research — rolling OPS/ERA/errors and rule-based takes off live MLB data,
          meant to be read and then fed into a Read; nothing in it is public-facing copy.
          Everything in <b>Snip studio</b> is public-safe: voice runs through the banned-word rule, links stay out of post bodies,
          and the Track Record post uses neutral &ldquo;alignment&rdquo; framing. Verify any <b>[bracketed]</b> field before posting.
          <b>Player stat cards</b> are plain numbers off MLB&rsquo;s own data — no model lean, no Edge Score — but still drop the
          link in your first reply, not the post, same as everything else here.
        </div>
      </div>
    </main>
  )
}

// ─── Styles (plain CSS — avoids Tailwind v4 / Turbopack responsive issues) ─────
const css = `
.admin{background:#FAF8F3;color:#1A1A1A;font-family:'JetBrains Mono',ui-monospace,monospace;min-height:100vh;padding:0 16px 80px}
.admin .wrap{max-width:880px;margin:0 auto}
.admin .topbar{display:flex;align-items:baseline;justify-content:space-between;border-bottom:3px solid #1A1A1A;padding:22px 0 14px;margin-bottom:28px;flex-wrap:wrap;gap:8px}
.admin .brand{font-family:Fraunces,Georgia,serif;font-weight:900;font-size:26px;letter-spacing:-.5px}
.admin .brand .mark{color:#FF5722}
.admin .brand .sub{font-weight:400;font-size:14px;color:#6b6b66}
.admin .topmeta{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#6b6b66}
.admin .sec{margin-bottom:34px}
.admin .sechead{display:flex;align-items:baseline;gap:10px;border-bottom:1px solid #1A1A1A1a;padding-bottom:8px;margin-bottom:16px}
.admin .sechead .glyph{color:#FF5722;font-size:18px}
.admin .sechead h2{font-family:Fraunces,Georgia,serif;font-weight:600;font-size:20px;letter-spacing:-.3px}
.admin .sechead .tag{margin-left:auto;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#6b6b66}
.admin .empty{border:1px dashed #1A1A1A1a;padding:18px;font-size:13px;color:#6b6b66;background:#fff}
.admin .yday{display:grid;grid-template-columns:auto 1fr;gap:24px;align-items:center;border:2px solid #1A1A1A;padding:20px 22px;background:#fff}
.admin .record{font-family:'Bebas Neue',sans-serif;font-size:88px;line-height:.82;letter-spacing:1px}
.admin .record small{display:block;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#6b6b66;margin-top:6px}
.admin .ydstats{display:grid;grid-template-columns:repeat(2,1fr);gap:14px 18px}
.admin .stat .n{font-family:'Bebas Neue',sans-serif;font-size:30px;line-height:1;color:#FF5722}
.admin .stat .l{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#6b6b66;margin-top:2px}
.admin .extremes{grid-column:1 / -1;border-top:1px dashed #1A1A1A1a;padding-top:12px;margin-top:4px;display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:12px}
.admin .extremes .ok{color:#15803d;font-weight:700}
.admin .extremes .miss{color:#FF5722;font-weight:700}
.admin .read{display:grid;grid-template-columns:30px 1fr auto;gap:12px;align-items:center;border:1px solid #1A1A1A1a;border-left:4px solid #1A1A1A1a;padding:12px 14px;background:#fff;margin-bottom:8px}
.admin .read.top{border-left-color:#FF5722;background:#fff7f4}
.admin .rank{font-family:'Bebas Neue',sans-serif;font-size:24px;color:#6b6b66;text-align:center}
.admin .read.top .rank{color:#FF5722}
.admin .matchup{font-weight:700;font-size:14px}
.admin .submeta{font-size:11px;color:#6b6b66;margin-top:2px}
.admin .submeta .star{color:#FF5722;font-weight:700}
.admin .edge{font-family:'Bebas Neue',sans-serif;font-size:34px;text-align:right;line-height:1}
.admin .edge small{display:block;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1px;color:#6b6b66;text-transform:uppercase}
.admin .lin-ok{color:#15803d}
.admin .lin-wait{color:#6b6b66}
.admin .footnote{font-size:10px;color:#6b6b66;border-top:1px solid #1A1A1A1a;padding-top:14px;margin-top:30px;line-height:1.7}
@media(max-width:560px){
  .admin .yday{grid-template-columns:1fr}
  .admin .record{font-size:72px}
  .admin .read{grid-template-columns:24px 1fr;gap:8px}
  .admin .edge{grid-column:2;text-align:left;margin-top:4px}
}
`