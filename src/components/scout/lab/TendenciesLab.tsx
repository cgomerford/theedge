'use client'

// src/components/scout/lab/TendenciesLab.tsx
//
// Scout Report → Tendencies, in the lab layout. A selector down the left: club pills, the game sheet, the club's splits, then its lineup hitters and its probable starter.
//   The game sheet    one row per situation: when it comes up and what the numbers show for it, with the tab it came from. Print it for a sheet with room for notes under every row.
//   Club splits       the lineup's OPS (plate-appearance weighted) against left- and right-handed pitching, at home and on the road, by day and night; tonight's case is marked
//   A hitter          his OPS in the same six splits with the plate appearances behind each
//   The starter       OPS against him in the same six splits with the batters faced
// Splits are Pro (or an opened look): a free viewer sees the first rows of the game sheet and a note, and the split data is never sent to the browser.
// Every row describes what the numbers show with its sample. Nothing here is a recommendation or a prediction.

import Link from 'next/link'
import { useState } from 'react'
import { Headshot, TeamMark } from '@/components/home/Logo'
import { C, SANS } from '@/components/team/ui'
import type { ClubSplits, SplitKey } from '@/lib/scout/splits'
import { Pills, kick, note, star, tile } from '@/components/pitching-lab/LocationExplorer'

export type SheetRow = { id: string; tag: string; when: string; body: string; title: string; tab: string; sectionLabel: string }
export type TendSide = { club: { id: number; abbr: string; name: string }; side: 'away' | 'home'; rows: SheetRow[]; lockedTags: string[]; splits: ClubSplits | null }
type View = 'sheet' | 'splits'
const GROUPS: { title: string; keys: [SplitKey, string][] }[] = [
  { title: 'Platoon', keys: [['vl', 'vs left-handed'], ['vr', 'vs right-handed']] },
  { title: 'Home and road', keys: [['h', 'At home'], ['a', 'On the road']] },
  { title: 'Day and night', keys: [['d', 'Day games'], ['n', 'Night games']] },
]
const dt: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: C.faint, textTransform: 'uppercase' }
const f3 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(3).replace(/^0\./, '.'))
const f2 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2))

function Bars({ rows, min, unit, hereKey, better }: { rows: { key: SplitKey; label: string; ops: number | null; n: number; extra?: string }[]; min: number; unit: string; hereKey: SplitKey[]; better: 'high' | 'low' }) {
  const max = Math.max(0.5, ...rows.map(r => r.ops ?? 0))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
      {rows.map(r => {
        const thin = r.n < min
        return (
          <div key={r.key} title={`${r.n} ${unit}`} style={{ opacity: r.n === 0 ? 0.4 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, fontWeight: 800 }}>
              <span>{r.label}{hereKey.includes(r.key) && <span style={{ marginLeft: 6, fontSize: 9.5, letterSpacing: '.08em', textTransform: 'uppercase', color: C.orange, border: `1px solid ${C.orange}`, borderRadius: 999, padding: '1px 6px' }}>tonight</span>}</span>
              <span style={{ fontWeight: 600, color: C.mute, fontVariantNumeric: 'tabular-nums' }}>{f3(r.ops)} OPS{r.extra ? ` · ${r.extra}` : ''} · {r.n} {unit}{thin && r.n > 0 && star}</span>
            </div>
            <div style={{ height: 11, background: C.soft, borderRadius: 6, overflow: 'hidden', marginTop: 3 }}><div style={{ height: '100%', width: `${r.ops != null ? (r.ops / max) * 100 : 0}%`, background: better === 'low' ? '#6CABDD' : C.orange }} /></div>
          </div>
        )
      })}
    </div>
  )
}

function Sheet({ s, print }: { s: TendSide; print?: boolean }) {
  return (
    <div className={print ? 'tn-club' : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {print && <h3 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{s.club.name}: the game sheet</h3>}
      {s.rows.length === 0 && <div style={tile}><p style={note}>Not enough data yet to fill in a sheet for {s.club.abbr}.</p></div>}
      {s.rows.map((w, i) => (
        <div key={w.id} className="tn-row" style={{ ...tile, display: 'grid', gridTemplateColumns: 'minmax(0,12rem) minmax(0,1fr)', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 22, height: 22, borderRadius: 999, background: C.ink, color: '#fff', fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{i + 1}</span>
              <span style={{ ...kick, fontSize: 9.5 }}>{w.tag}</span>
            </div>
            <div style={{ ...dt, marginTop: 10 }}>When</div>
            <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.35 }}>{w.when}</div>
          </div>
          <div>
            <div style={dt}>What the numbers show</div>
            <p style={{ margin: '2px 0 0', fontSize: 13.5, color: '#3a352c', lineHeight: 1.55 }}>{w.body}</p>
            {print ? <p style={{ margin: '4px 0 0', fontSize: 11, color: C.faint }}>{w.title}</p> : <Link href={`?tab=${w.tab}`} className="tn-noprint" style={{ display: 'inline-block', marginTop: 6, fontSize: 12, fontWeight: 800, color: C.orange, textDecoration: 'none' }}>See the charts →</Link>}
          </div>
          {print && <div className="tn-notes" style={{ gridColumn: '1 / -1' }} />}
        </div>
      ))}
    </div>
  )
}

export default function TendenciesLab({ clubs, isPro, dayNight, minPa, minBf }: { clubs: { away: TendSide; home: TendSide }; isPro: boolean; dayNight: 'day' | 'night' | null; minPa: number; minBf: number }) {
  const [side, setSide] = useState<'away' | 'home'>('away')
  const [pick, setPick] = useState('sheet')
  const k = clubs[side], opp = clubs[side === 'away' ? 'home' : 'away']
  const sp = k.splits
  const kind = pick.startsWith('h:') ? 'hitter' : pick === 'starter' ? 'starter' : pick === 'splits' ? 'splits' : 'sheet'
  const hitter = kind === 'hitter' ? sp?.lineup.find(h => String(h.id) === pick.slice(2)) : undefined
  // tonight's case: the lineup bats against the OTHER club's starter, in this club's home or road game, in a day or night game
  const oppHand = opp.splits?.pitcher?.throws ?? null
  const here: SplitKey[] = [oppHand === 'L' ? 'vl' : oppHand === 'R' ? 'vr' : null, side === 'home' ? 'h' : 'a', dayNight === 'day' ? 'd' : dayNight === 'night' ? 'n' : null].filter((x): x is SplitKey => !!x)
  // the starter's splits run by the batter's side, so only home/road and day/night mark tonight for him (he pitches for this club)
  const hereStarter = here.filter(x => x === 'h' || x === 'a' || x === 'd' || x === 'n')
  const title = hitter?.name ?? (kind === 'starter' ? sp?.pitcher?.name : kind === 'splits' ? `${k.club.name} splits` : `${k.club.name}: the game sheet`)

  return (
    <div className="tn-grid">
      <style>{`.tn-grid{display:grid;grid-template-columns:230px minmax(0,1fr);gap:24px;align-items:start}.tn-side{position:sticky;top:64px;display:flex;flex-direction:column;gap:6px}.tn-btn{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:7px 10px;border-radius:12px;border:1px solid #e7e2d8;background:#fff;cursor:pointer;font-weight:800;font-size:13px;color:#1A1A1A;font-family:inherit}.tn-btn small{display:block;font-weight:600;font-size:11.5px;color:#8a8275}.tn-btn.on{border-color:#FF5722;background:#fff1ea}.tn-h{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#a89e8c;margin:8px 2px 0}.tn-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:stretch}.tn-span2{grid-column:span 2}.tn-span3{grid-column:1 / -1}.tn-print{display:none}.tn-notes{height:26px;border-bottom:1px dashed #a8a29e}@media (max-width:1180px){.tn-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:860px){.tn-grid{grid-template-columns:minmax(0,1fr)}.tn-side{position:static;flex-direction:row;overflow-x:auto;padding-bottom:4px}.tn-h{display:none}.tn-btn{width:auto;white-space:nowrap}.tn-tiles{grid-template-columns:minmax(0,1fr)}.tn-span2{grid-column:auto}}@media print{body *{visibility:hidden !important}#tendencies-print,#tendencies-print *{visibility:visible !important}#tendencies-print{display:block !important;position:absolute;left:0;top:0;width:100%}.tn-noprint{display:none !important}.tn-club{break-after:page}.tn-club:last-child{break-after:auto}.tn-row{break-inside:avoid}}`}</style>

      <nav className="tn-side" aria-label="Tendencies subjects">
        <Pills items={[['away', clubs.away.club.abbr], ['home', clubs.home.club.abbr]] as ['away' | 'home', string][]} value={side} onChange={v => { setSide(v); setPick('sheet') }} />
        <button type="button" className={`tn-btn${kind === 'sheet' ? ' on' : ''}`} onClick={() => setPick('sheet')}><TeamMark id={k.club.id} abbr={k.club.abbr} size={28} /><span style={{ minWidth: 0 }}>The game sheet<small>{k.rows.length} row{k.rows.length === 1 ? '' : 's'}{k.lockedTags.length ? ` + ${k.lockedTags.length} in Pro` : ''}</small></span></button>
        {isPro && <button type="button" className={`tn-btn${kind === 'splits' ? ' on' : ''}`} onClick={() => setPick('splits')}><span style={{ width: 28, textAlign: 'center', fontSize: 16 }}>⇄</span><span style={{ minWidth: 0 }}>Club splits<small>Platoon, home and road, day and night</small></span></button>}
        {isPro && <div className="tn-h">Lineup</div>}
        {isPro && (sp?.lineup ?? []).length === 0 && <p style={{ ...note, margin: '0 2px' }}>No lineup is available yet.</p>}
        {isPro && (sp?.lineup ?? []).map(h => (
          <button key={h.id} type="button" className={`tn-btn${pick === `h:${h.id}` ? ' on' : ''}`} onClick={() => setPick(`h:${h.id}`)}>
            <Headshot id={h.id} name={h.name} size={32} />
            <span style={{ minWidth: 0 }}>{h.order}. {h.name}<small>bats {h.bats ?? '?'}</small></span>
          </button>
        ))}
        {isPro && <div className="tn-h">Probable starter</div>}
        {isPro && (sp?.pitcher ? (
          <button type="button" className={`tn-btn${kind === 'starter' ? ' on' : ''}`} onClick={() => setPick('starter')}><Headshot id={sp.pitcher.id} name={sp.pitcher.name} size={32} /><span style={{ minWidth: 0 }}>{sp.pitcher.name}<small>{sp.pitcher.throws ?? '?'}HP</small></span></button>
        ) : <p style={{ ...note, margin: '0 2px' }}>No probable starter yet.</p>)}
      </nav>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: SANS }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {hitter ? <Headshot id={hitter.id} name={hitter.name} size={52} /> : kind === 'starter' && sp?.pitcher ? <Headshot id={sp.pitcher.id} name={sp.pitcher.name} size={52} /> : <TeamMark id={k.club.id} abbr={k.club.abbr} size={44} />}
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.01em' }}>{title}</h2>
          {kind === 'sheet' && <button type="button" onClick={() => window.print()} style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, borderRadius: 999, padding: '4px 12px', border: `1px solid ${C.line}`, background: '#fff', cursor: 'pointer' }}>⎙ Print the sheet</button>}
        </div>

        {kind === 'sheet' && (
          <>
            <p style={{ ...note, margin: 0 }}>One row per situation: when it comes up, and what the numbers show for it. Print it for a sheet with room for notes under every row.</p>
            <Sheet s={k} />
            {k.lockedTags.length > 0 && (
              <div style={{ ...tile, textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 14, color: '#5b5347' }}>{k.lockedTags.length} more {k.club.abbr} row{k.lockedTags.length === 1 ? '' : 's'} on the sheet in the Pro Scout Report: {k.lockedTags.join(', ')}.</p>
                <Link href="/pricing" style={{ display: 'inline-block', marginTop: 6, fontSize: 12, fontWeight: 800, color: C.orange, textDecoration: 'none' }}>See Pro →</Link>
              </div>
            )}
          </>
        )}

        {kind === 'splits' && sp && (
          <div className="tn-tiles">
            {GROUPS.map(g => (
              <div key={g.title} style={tile}>
                <div style={kick}>{k.club.abbr} lineup · {g.title}</div>
                <Bars min={minPa} unit="PA" better="high" hereKey={here} rows={g.keys.map(([key, label]) => ({ key, label, ops: sp.lineupOps[key]?.ops ?? null, n: sp.lineupOps[key]?.pa ?? 0 }))} />
              </div>
            ))}
            <div className="tn-span3" style={tile}>
              <div style={kick}>Tonight&apos;s case</div>
              <p style={{ margin: '8px 0 0', fontSize: 14, color: '#3a352c', lineHeight: 1.55 }}>
                {k.club.abbr} bats {side === 'home' ? 'at home' : 'on the road'}{dayNight ? ` in a ${dayNight} game` : ''}{oppHand ? `, against a ${oppHand === 'L' ? 'left' : 'right'}-handed starter (${opp.splits?.pitcher?.name})` : ''}. The rows marked &ldquo;tonight&rdquo; are the matching splits.
              </p>
              <p style={note}>Lineup: {sp.lineupSource === 'confirmed' ? 'confirmed' : sp.lineupSource === 'projected_from_previous_game' ? 'taken from the last game' : 'not available'}. OPS is weighted by plate appearances across the hitters. {star} marks under {minPa} PA. Click a hitter to see his own splits.</p>
            </div>
          </div>
        )}

        {hitter && (
          <div className="tn-tiles">
            {GROUPS.map(g => (
              <div key={g.title} style={tile}>
                <div style={kick}>{g.title}</div>
                <Bars min={minPa} unit="PA" better="high" hereKey={here} rows={g.keys.map(([key, label]) => ({ key, label, ops: hitter.splits[key]?.ops ?? null, n: hitter.splits[key]?.pa ?? 0, extra: hitter.splits[key]?.avg != null ? `${f3(hitter.splits[key]!.avg)} AVG` : undefined }))} />
              </div>
            ))}
            <p className="tn-span3" style={{ ...note, margin: 0 }}>Season OPS in each split, with the plate appearances behind it. {star} marks under {minPa} PA. &ldquo;Tonight&rdquo; marks the matching case. He bats {hitter.bats === 'S' ? 'from both sides' : hitter.bats ?? '?'}.</p>
          </div>
        )}

        {kind === 'starter' && sp?.pitcher && (
          <div className="tn-tiles">
            {GROUPS.map(g => (
              <div key={g.title} style={tile}>
                <div style={kick}>OPS against · {g.title}</div>
                <Bars min={minBf} unit="BF" better="low" hereKey={hereStarter} rows={g.keys.map(([key, label]) => ({ key, label: g.title === 'Platoon' ? label.replace('vs left-handed', 'vs left-handed batters').replace('vs right-handed', 'vs right-handed batters') : label, ops: sp.pitcher!.splits[key]?.ops ?? null, n: sp.pitcher!.splits[key]?.bf ?? 0, extra: sp.pitcher!.splits[key]?.era != null ? `${f2(sp.pitcher!.splits[key]!.era)} ERA` : undefined }))} />
              </div>
            ))}
            <p className="tn-span3" style={{ ...note, margin: 0 }}>Season splits against {sp.pitcher.name}, with the batters faced behind each. Blue bars are OPS allowed. {star} marks under {minBf} batters faced.</p>
          </div>
        )}

        {!isPro && <p style={{ ...note, margin: 0 }}>Platoon, home and road and day and night splits for both lineups and starters are in the Pro Scout Report.</p>}
        <p style={{ ...note, margin: 0 }}>Information, not advice. Each row restates numbers from the other tabs with the sample behind it; nothing here is a recommendation or a prediction. Rows are left out when their sample is too thin to say anything. Splits come from the MLB Stats API.</p>
      </div>

      <div id="tendencies-print" className="tn-print" aria-hidden>
        <Sheet s={clubs.away} print /><Sheet s={clubs.home} print />
      </div>
    </div>
  )
}
