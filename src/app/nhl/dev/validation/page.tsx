import Link from 'next/link'
import { C, SANS, MONO, Section, Card, Empty, Foot } from '@/components/team/ui'
import { getRecentValidation, getGamesByIds, getPlayerGameDrilldown } from '@/lib/nhl/queries'

// Private N1 prototype: the latest 50 nhl_ingest_validation rows plus a
// per-player drill-down (ours vs box vs reference, in seconds) for one game
// at a time via ?game=<id>. Gated by src/lib/maintenance-gates.ts + this
// route's own noindex layout -- only reachable in local dev via the preview
// bypass cookie (see DESIGN_SYSTEM.md / CLAUDE.md §4 for how that works).
export default async function NhlValidationPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>
}) {
  const { game } = await searchParams
  const gameId = game ? Number(game) : null

  const rows = await getRecentValidation(50)
  const gameIds = rows.map((r) => r.game_id)
  const games = await getGamesByIds(gameIds)
  const drilldown = gameId ? await getPlayerGameDrilldown(gameId) : []

  const cleanGames = rows.filter((r) => (r.toi_fail ?? 0) === 0 && (r.strength_fail ?? 0) === 0).length

  return (
    <div style={{ background: C.cream, minHeight: '100vh', padding: '32px 24px' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <h1 style={{ fontFamily: SANS, fontWeight: 800, fontSize: 30, color: C.ink, margin: 0 }}>
          NHL ingest validation (N1 dev prototype)
        </h1>
        <p style={{ fontFamily: MONO, fontSize: 11, color: C.faint, marginTop: 6 }}>
          {rows.length} games · {cleanGames} fully clean ({rows.length ? ((cleanGames / rows.length) * 100).toFixed(0) : 0}%)
        </p>

        <Section id="games" num="01" title="Recent games">
          {rows.length === 0 ? (
            <Empty>No validation rows yet -- run backfill.py or ingest_game.py.</Empty>
          ) : (
            <Card>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: C.faint, borderBottom: `1px solid ${C.line}` }}>
                    <th style={{ padding: '6px 8px' }}>game_id</th>
                    <th style={{ padding: '6px 8px' }}>date</th>
                    <th style={{ padding: '6px 8px' }}>status</th>
                    <th style={{ padding: '6px 8px' }}>players</th>
                    <th style={{ padding: '6px 8px' }}>skaters</th>
                    <th style={{ padding: '6px 8px' }}>toi_fail</th>
                    <th style={{ padding: '6px 8px' }}>strength_fail</th>
                    <th style={{ padding: '6px 8px' }}>unchecked</th>
                    <th style={{ padding: '6px 8px' }}>max_toi_err_s</th>
                    <th style={{ padding: '6px 8px' }}>max_strength_err_s</th>
                    <th style={{ padding: '6px 8px' }}>ref_available</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const g = games.get(r.game_id)
                    const bad = (r.toi_fail ?? 0) > 0 || (r.strength_fail ?? 0) > 0
                    return (
                      <tr key={r.game_id} style={{ borderBottom: `1px solid ${C.soft}`, background: bad ? '#FAD9D2' : 'transparent' }}>
                        <td style={{ padding: '6px 8px' }}>
                          <Link href={`/nhl/dev/validation?game=${r.game_id}`} style={{ color: C.orange }}>
                            {r.game_id}
                          </Link>
                        </td>
                        <td style={{ padding: '6px 8px' }}>{g?.game_date ?? '—'}</td>
                        <td style={{ padding: '6px 8px' }}>{g?.ingest_status ?? '—'}</td>
                        <td style={{ padding: '6px 8px' }}>{r.players ?? '—'}</td>
                        <td style={{ padding: '6px 8px' }}>{r.skaters ?? '—'}</td>
                        <td style={{ padding: '6px 8px' }}>{r.toi_fail ?? '—'}</td>
                        <td style={{ padding: '6px 8px' }}>{r.strength_fail ?? '—'}</td>
                        <td style={{ padding: '6px 8px' }}>{r.strength_unchecked ?? '—'}</td>
                        <td style={{ padding: '6px 8px' }}>{r.max_toi_err_s ?? '—'}</td>
                        <td style={{ padding: '6px 8px' }}>{r.max_strength_err_s ?? '—'}</td>
                        <td style={{ padding: '6px 8px' }}>{r.ref_available ? 'yes' : 'no'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          )}
          <Foot>Source: NHL (private prototype, see CLAUDE.md §6 content rules). Not a public page.</Foot>
        </Section>

        {gameId && (
          <Section id="drilldown" num="02" title={`Player drill-down: game ${gameId}`}>
            {drilldown.length === 0 ? (
              <Empty>No nhl_player_game rows for this game.</Empty>
            ) : (
              <Card>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: C.faint, borderBottom: `1px solid ${C.line}` }}>
                      <th style={{ padding: '6px 8px' }}>player_id</th>
                      <th style={{ padding: '6px 8px' }}>pos</th>
                      <th style={{ padding: '6px 8px' }}>toi_s</th>
                      <th style={{ padding: '6px 8px' }}>box_toi_s</th>
                      <th style={{ padding: '6px 8px' }}>toi_check</th>
                      <th style={{ padding: '6px 8px' }}>ev / ref_ev</th>
                      <th style={{ padding: '6px 8px' }}>pp / ref_pp</th>
                      <th style={{ padding: '6px 8px' }}>sh / ref_sh</th>
                      <th style={{ padding: '6px 8px' }}>strength_check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drilldown.map((p) => (
                      <tr
                        key={p.player_id}
                        style={{
                          borderBottom: `1px solid ${C.soft}`,
                          background: p.toi_check === 'fail' || p.strength_check === 'fail' ? '#FAD9D2' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '6px 8px' }}>{p.player_id}</td>
                        <td style={{ padding: '6px 8px' }}>{p.position}</td>
                        <td style={{ padding: '6px 8px' }}>{p.toi_s}</td>
                        <td style={{ padding: '6px 8px' }}>{p.box_toi_s}</td>
                        <td style={{ padding: '6px 8px' }}>{p.toi_check}</td>
                        <td style={{ padding: '6px 8px' }}>{p.toi_ev_s} / {p.ref_ev_s ?? '—'}</td>
                        <td style={{ padding: '6px 8px' }}>{p.toi_pp_s} / {p.ref_pp_s ?? '—'}</td>
                        <td style={{ padding: '6px 8px' }}>{p.toi_sh_s} / {p.ref_sh_s ?? '—'}</td>
                        <td style={{ padding: '6px 8px' }}>{p.strength_check}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </Section>
        )}
      </div>
    </div>
  )
}
