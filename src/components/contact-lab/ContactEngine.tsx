'use client'

// src/components/contact-lab/ContactEngine.tsx
//
// Body of /mlb/lab/contact (mockups/contact-engine.html, right page). § 01 the league scatter of Pull AIR% against Barrel%
// (one dot per hitter with MIN_LEADERBOARD+ batted balls) · § 02 the leaderboard. COUNTS behind every rate: each row shows
// the batted-ball count and a reliability badge, every chart has a source/method footnote. Sign-up gate only (the page
// checks it); no Pro data. Descriptions only.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { C, Card, Empty, Foot, Section } from '@/components/team/ui'
import { MIN_LEADERBOARD, STABLE_BBE, TIER_LABEL, tierOf, type ContactLeaders } from '@/lib/contact-profile/model'
import ContactScatter from './ContactScatter'

type SortKey = 'barrel' | 'pullAir' | 'pull' | 'gb' | 'n'
const COLS: [SortKey, string][] = [['barrel', 'Barrel%'], ['pullAir', 'Pull AIR%'], ['pull', 'Pull%'], ['gb', 'Ground-ball%'], ['n', 'Batted balls']]
const PAGE = 25
const pct = (x: number | null, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`)
const fmt = (n: number) => n.toLocaleString('en-US')

export default function ContactEngine({ leaders, initialSelected = null }: { leaders: ContactLeaders; initialSelected?: number | null }) {
  const [season, setSeason] = useState(leaders.season)
  const [sort, setSort] = useState<SortKey>('barrel')
  const [desc, setDesc] = useState(true)
  const [q, setQ] = useState('')
  const [shown, setShown] = useState(PAGE)
  const [selected, setSelected] = useState<number | null>(initialSelected)

  // only the latest season's rows are loaded by the page; changing season is a navigation (below), so `season` just labels
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return leaders.rows
      .filter(r => !needle || r.name.toLowerCase().includes(needle) || (r.team ?? '').toLowerCase() === needle)
      .sort((a, b) => (desc ? b[sort] - a[sort] : a[sort] - b[sort]))
  }, [leaders.rows, q, sort, desc])
  const lg = leaders.league
  const tile = (k: string, v: string, s: string) => (
    <div key={k} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ fontSize: 10, letterSpacing: '.12em', fontWeight: 700, color: C.mute, textTransform: 'uppercase' }}>{k}</div>
      <div style={{ fontWeight: 800, fontSize: 30, lineHeight: 1.15, marginTop: 2 }}>{v}</div>
      <div style={{ fontSize: 12, color: C.mute }}>{s}</div>
    </div>
  )

  return (
    <div>
      <style>{CSS}</style>
      <div className="ce-bar">
        <div className="ce-seg" role="group" aria-label="Season">
          {leaders.seasons.map(s => (
            <Link key={s} href={s === leaders.seasons[leaders.seasons.length - 1] ? '/mlb/lab/contact' : `/mlb/lab/contact?season=${s}`} className={s === season ? 'on' : ''} aria-current={s === season}>{s}</Link>
          ))}
        </div>
      </div>
      {lg && (
        <div className="ce-tiles">
          {tile('League Barrel%', pct(lg.barrel / lg.n_bbe), `${fmt(lg.barrel)} of ${fmt(lg.n_bbe)} batted balls`)}
          {tile('League Pull AIR%', pct(lg.pull_air / lg.n_bbe), `${fmt(lg.pull_air)} of ${fmt(lg.n_bbe)}`)}
          {tile('League ground-ball%', pct(lg.gb / lg.n_bbe), `${fmt(lg.gb)} of ${fmt(lg.n_bbe)}`)}
          {tile('Hitters shown', fmt(leaders.rows.length), `${MIN_LEADERBOARD}+ batted balls in ${season}`)}
        </div>
      )}

      <Section id="scatter" num="01" title="Pull in the air, hit hard" sub="Each dot is a hitter: how often he pulls the ball in the air, against how often he barrels it.">
        <Card title="Pull AIR% vs Barrel%">
          {rows.length === 0 ? <Empty>No hitter matches.</Empty> : <ContactScatter rows={rows} season={season} selectedId={selected} onSelect={setSelected} />}
        </Card>
      </Section>

      <Section id="leaders" num="02" title="The leaderboard" sub="Every hitter in the scatter, sortable.">
        <Card title="Contact leaders">
          <div className="ce-bar">
            <input className="ce-q" type="search" placeholder="Find a hitter or team (PHI)" value={q} onChange={e => { setQ(e.target.value); setShown(PAGE) }} aria-label="Find a hitter or team" />
            <span className="ce-n">{fmt(rows.length)} hitters · {MIN_LEADERBOARD}+ batted balls</span>
          </div>
          {rows.length === 0 ? <Empty>No hitter matches.</Empty> : (
            <div className="ce-tw"><table className="ce-tbl">
              <thead><tr><th>#</th><th>Hitter</th>
                {COLS.map(([k, l]) => <th key={k} className="r"><button type="button" className={`ce-th${sort === k ? ' on' : ''}`} onClick={() => { if (sort === k) setDesc(d => !d); else { setSort(k); setDesc(true) } setShown(PAGE) }}>{l}{sort === k ? (desc ? ' ↓' : ' ↑') : ''}</button></th>)}
                <th>Reliability</th></tr></thead>
              <tbody>{rows.slice(0, shown).map((r, i) => {
                const t = tierOf(r.n)
                return (
                  <tr key={r.id} onClick={() => setSelected(r.id)} style={{ cursor: 'pointer', background: r.id === selected ? '#fffdf3' : undefined }}>
                    <td className="m">{i + 1}</td>
                    <td><Link href={`/mlb/lab/batting-lab/${r.id}/contact`} className="ce-nm">{r.name}</Link> <span className="m">{r.team ?? ''}</span></td>
                    <td className="r">{pct(r.barrel)}</td><td className="r">{pct(r.pullAir)}</td><td className="r">{pct(r.pull)}</td><td className="r">{pct(r.gb)}</td><td className="r">{fmt(r.n)}</td>
                    <td>{t && <span className="ce-badge"><i style={{ background: t === 'stable' ? C.good : t === 'moderate' ? '#E0A800' : C.faint }} />{TIER_LABEL[t]} <small>n = {fmt(r.n)}</small></span>}</td>
                  </tr>
                )
              })}</tbody>
            </table></div>
          )}
          {rows.length > shown && <button type="button" className="ce-more" onClick={() => setShown(s => s + PAGE)}>Show {Math.min(PAGE, rows.length - shown)} more</button>}
          <Foot>Source: Baseball Savant via pybaseball. Rates are shares of each hitter’s batted balls; the batted-ball count beside them is the sample. Reliability: Stable {STABLE_BBE}+ batted balls, Moderate 75–{STABLE_BBE - 1}, Thin 30–74 (the list starts at {MIN_LEADERBOARD}). Click a row to highlight the hitter in the scatter; click a name for his full Contact tab.</Foot>
        </Card>
      </Section>
    </div>
  )
}

const CSS = `
.ce-bar{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin:0 0 14px}
.ce-seg{display:inline-flex;gap:6px}
.ce-seg a{border:1px solid ${C.line};background:#fff;border-radius:999px;padding:6px 14px;font-weight:600;font-size:13px;color:${C.ink};text-decoration:none}
.ce-seg a.on{background:${C.ink};color:#fff;border-color:${C.ink}}
.ce-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.ce-cap{color:#5b5347;font-size:13px;margin:0 0 12px}
.ce-q{border:1px solid ${C.line};border-radius:999px;padding:7px 14px;font-size:13px;font-family:inherit;min-width:230px;background:#fff;color:${C.ink}}
.ce-n{font-size:12px;color:${C.mute}}
.ce-tw{overflow-x:auto;border:1px solid ${C.line};border-radius:10px}
.ce-tbl{width:100%;border-collapse:collapse;font-size:13.5px}
.ce-tbl th{background:${C.soft};text-align:left;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:${C.mute};padding:8px 12px;font-weight:700;white-space:nowrap}
.ce-tbl td{padding:8px 12px;border-top:1px solid ${C.line};white-space:nowrap;font-variant-numeric:tabular-nums}
.ce-tbl .r{text-align:right}.ce-tbl .m{color:${C.mute};font-size:12px}
.ce-th{all:unset;cursor:pointer;font:inherit;letter-spacing:inherit;text-transform:inherit;color:inherit}.ce-th.on{color:${C.ink}}
.ce-th:focus-visible,.ce-more:focus-visible,.ce-seg a:focus-visible{outline:2px solid ${C.orange};outline-offset:2px}
.ce-nm{color:${C.ink};font-weight:700;text-decoration:none}.ce-nm:hover{color:${C.orange}}
.ce-badge{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;border-radius:999px;padding:3px 10px;border:1px solid ${C.line};background:#fff}
.ce-badge i{width:8px;height:8px;border-radius:50%;display:inline-block}.ce-badge small{font-weight:500;color:${C.mute}}
.ce-more{margin-top:12px;border:1px solid ${C.line};background:#fff;border-radius:999px;padding:7px 18px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}
@media(max-width:900px){.ce-tiles{grid-template-columns:1fr 1fr}.ce-q{min-width:0;flex:1}}
`
