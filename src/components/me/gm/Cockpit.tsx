// src/components/me/gm/Cockpit.tsx
//
// The GM cockpit on My x9Lab: a dark instrument panel over the players a person follows. Top: the gauges (squad rating, how many are heating, cooling, and flagged). Middle: one
// Ultimate Team style card per followed player (rating, his Savant percentile bars, his latest form trend, where he ranks in the league). Bottom: "Needs your attention", the real
// flags behind the gauges. Server component, no client code. The rating is Pro's: a free card shows its three ranks and a PRO mark where the number would be.

import Link from 'next/link'
import { Headshot } from '@/components/home/Logo'
import { ordinal } from '@/lib/ordinal'
import type { Cockpit, Flag, SquadMember } from '@/lib/gm/cockpit'
import { C, GREY, NUMS, SANS } from '../ui'

const INK = '#17140F', PANEL = '#221E17', LINE = '#3a342a', DIM = '#a89e8c'
const TONE = { good: '#4CC38A', warn: '#6FA8E8', info: '#FDE047' } as const
const barCol = (p: number) => (p >= 60 ? '#FF5722' : p <= 40 ? '#5E7A99' : '#8a8275')

function Gauge({ value, label, sub }: { value: number | null; label: string; sub: string }) {
  const r = 38, c = Math.PI * r, v = value == null ? 0 : Math.max(0, Math.min(100, value))
  return (
    <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, padding: '12px 14px', textAlign: 'center' }}>
      <svg viewBox="0 0 100 56" width="100%" style={{ maxWidth: 150, display: 'block', margin: '0 auto' }} role="img" aria-label={`${label}: ${value ?? 'pending'}`}>
        <path d="M12 50 A38 38 0 0 1 88 50" fill="none" stroke={LINE} strokeWidth="9" strokeLinecap="round" />
        {value != null && <path d="M12 50 A38 38 0 0 1 88 50" fill="none" stroke="#FF5722" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} />}
        <text x="50" y="46" textAnchor="middle" fontSize="22" fontWeight="800" fill="#fff" style={{ fontFamily: SANS }}>{value ?? '—'}</text>
      </svg>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.14em', color: '#FDE047', marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 11.5, color: DIM, marginTop: 2 }}>{sub}</div>
    </div>
  )
}

function Count({ n, label, sub, color, glyph }: { n: number; label: string; sub: string; color: string; glyph: string }) {
  return (
    <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, padding: '12px 14px', textAlign: 'center' }}>
      <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1, color, ...NUMS }}>{glyph} {n}</div>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.14em', color: '#FDE047', marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 11.5, color: DIM, marginTop: 2 }}>{sub}</div>
    </div>
  )
}

function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null
  const w = 116, h = 30, lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - lo) / span) * (h - 8)] as const)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden>
      <polyline points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" fill={color} />
    </svg>
  )
}

const METRIC: Record<string, string> = { ops: 'OPS', avg: 'AVG', slg: 'SLG', obp: 'OBP', era: 'ERA', whip: 'WHIP' }
const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

function Card({ m, isPro }: { m: SquadMember; isPro: boolean }) {
  const sig = m.signal
  const form = sig ? (sig.signal === 'heating' ? '#1E8E5A' : '#2F63A8') : '#6b6354'
  // Pro sees his best three and his three lowest ranks; free sees the three it is given
  const bars = m.pct.length > 6 ? [...m.pct.slice(0, 3), ...m.pct.slice(-3)] : m.pct
  return (
    <Link href={`/mlb/players/${m.id}`} style={{ textDecoration: 'none', color: '#1A1A1A', borderRadius: 18, padding: 12, background: 'linear-gradient(160deg,#FFF3B0 0%,#FDE047 48%,#F0B400 100%)', boxShadow: '0 6px 18px rgba(0,0,0,.35), inset 0 0 0 2px rgba(255,255,255,.35)', display: 'grid', gap: 8, alignContent: 'start' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '58px minmax(0,1fr)', gap: 10, alignItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          {m.rating != null
            ? <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1, letterSpacing: '-.02em', ...NUMS }} title="Average of his Savant percentile ranks">{m.rating}</div>
            : <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.1, background: '#1A1A1A', color: '#FDE047', borderRadius: 6, padding: '6px 4px' }} title="The rating is the average of every Savant percentile rank. Pro shows it.">PRO</div>}
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', marginTop: 3 }}>{m.pos ?? (m.isPitcher ? 'P' : '')}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#5b4a00' }}>{m.team ?? ''}</div>
        </div>
        <div style={{ justifySelf: 'end' }}><Headshot id={m.id} name={m.name} size={104} /></div>
      </div>
      <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.01em', lineHeight: 1.1, borderTop: '2px solid rgba(26,26,26,.25)', paddingTop: 6 }}>{m.name}</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 4 }}>
        {m.tiles.map(t => <div key={t.l} style={{ background: 'rgba(255,255,255,.45)', borderRadius: 6, textAlign: 'center', padding: '3px 2px' }}><div style={{ fontSize: 15, fontWeight: 800, ...NUMS }}>{t.v}</div><div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.08em' }}>{t.l}</div></div>)}
      </div>

      {bars.length > 0 && (
        <div style={{ display: 'grid', gap: 3 }}>
          {bars.map(r => (
            <div key={r.key} style={{ display: 'grid', gridTemplateColumns: '74px minmax(0,1fr) 22px', gap: 6, alignItems: 'center', fontSize: 11, fontWeight: 700 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
              <span style={{ height: 6, background: 'rgba(26,26,26,.18)', borderRadius: 3, overflow: 'hidden' }}><i style={{ display: 'block', height: 6, width: `${r.pct}%`, background: barCol(r.pct) }} /></span>
              <b style={{ textAlign: 'right', ...NUMS }}>{r.pct}</b>
            </div>
          ))}
          {!isPro && m.lockedCount > 0 && <div style={{ fontSize: 10.5, fontWeight: 700, color: '#5b4a00' }}>+{m.lockedCount} more ranks with Pro</div>}
        </div>
      )}

      <div style={{ background: 'rgba(23,20,15,.9)', color: '#fff', borderRadius: 10, padding: '7px 9px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', color: sig ? (sig.signal === 'heating' ? '#4CC38A' : '#8FBDF2') : DIM }}>FORM · {sig ? sig.signal.toUpperCase() : 'NO SIGNAL'}</div>
          <div style={{ fontSize: 11.5, color: '#e9e3d4' }}>{sig ? `${METRIC[sig.metric] ?? sig.metric.toUpperCase()} ${sig.metric === 'era' ? sig.current.toFixed(2) : sig.current.toFixed(3).replace(/^0/, '')} · as of ${shortDate(sig.date)}` : 'Not enough recent games'}</div>
        </div>
        {sig && <Spark values={sig.trend} color={sig.signal === 'heating' ? '#4CC38A' : '#8FBDF2'} />}
      </div>
      {m.ranks.length > 0 && <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.45 }}>{m.ranks.map(r => `${r.label} ${r.value} (${ordinal(r.rank)} of ${r.of})`).join(' · ')}</div>}
      <div style={{ fontSize: 10.5, fontWeight: 600, color: '#5b4a00', ...{ borderTop: `1px solid ${form}33` } }}>{m.next ? `Next: ${m.next}` : m.lastGame ?? ''}</div>
    </Link>
  )
}

function FlagRow({ f }: { f: Flag }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '10px minmax(0,1fr) auto', gap: 10, padding: '10px 0', borderTop: `1px solid ${LINE}`, alignItems: 'start' }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: TONE[f.tone], marginTop: 5 }} />
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{f.playerId ? <Link href={`/mlb/players/${f.playerId}`} style={{ color: '#fff', textDecoration: 'none' }}>{f.title}</Link> : f.title}</div>
        <div style={{ fontSize: 12.5, color: DIM, lineHeight: 1.5, marginTop: 2 }}>{f.detail}</div>
      </div>
      <div style={{ fontSize: 11.5, color: DIM, whiteSpace: 'nowrap', ...NUMS }}>{f.date ? shortDate(f.date) : ''}</div>
    </div>
  )
}

export default function GmCockpit({ cockpit, isPro, nextLine }: { cockpit: Cockpit; isPro: boolean; nextLine: string | null }) {
  const g = cockpit.gauges
  return (
    <section aria-label="GM cockpit" style={{ background: INK, color: '#fff', borderRadius: 20, padding: '18px 18px 20px', marginBottom: 26, backgroundImage: 'radial-gradient(circle at 12% -10%, rgba(255,87,34,.16), transparent 45%), linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px)', backgroundSize: 'auto, 100% 28px' }}>
      <style>{`.gm-gauges{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.gm-squad{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;margin-top:16px}.gm-main{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:18px;align-items:start}@media(max-width:1000px){.gm-main{grid-template-columns:minmax(0,1fr)}}@media(max-width:700px){.gm-gauges{grid-template-columns:repeat(2,minmax(0,1fr))}}`}</style>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.16em', color: '#FF5722' }}>GM COCKPIT</div>
        <h2 style={{ margin: 0, fontSize: 'clamp(22px,3vw,30px)', fontWeight: 800, letterSpacing: '-.02em' }}>Your squad</h2>
        <span style={{ fontSize: 12.5, color: DIM }}>{cockpit.members.length} player{cockpit.members.length === 1 ? '' : 's'} you follow{nextLine ? ` · ${nextLine}` : ''}</span>
      </div>

      <div className="gm-gauges">
        <Gauge value={g.rating} label="SQUAD RATING" sub={isPro ? (g.rated ? `average of ${g.rated} player rating${g.rated === 1 ? '' : 's'}` : 'ratings pending') : 'Pro shows the rating'} />
        <Count n={g.heating} label="HEATING" sub="recent form up" color="#4CC38A" glyph="▲" />
        <Count n={g.cooling} label="COOLING" sub="recent form down" color="#8FBDF2" glyph="▼" />
        <Count n={g.flags} label="NEEDS A LOOK" sub="flags below" color="#FDE047" glyph="●" />
      </div>

      {cockpit.members.length === 0 ? (
        <div style={{ marginTop: 16, fontSize: 14.5, color: DIM }}>Follow players from their pages and they appear here as your squad, each with a rating, recent form and where they rank in the league.</div>
      ) : (
        <div className="gm-main" style={{ marginTop: 6 }}>
          <div className="gm-squad">{cockpit.members.map(m => <Card key={m.id} m={m} isPro={isPro} />)}</div>
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.16em', color: '#FDE047', marginBottom: 2 }}>NEEDS YOUR ATTENTION</div>
            {cockpit.flags.length === 0 ? <div style={{ fontSize: 13.5, color: DIM, padding: '10px 0', borderTop: `1px solid ${LINE}` }}>Nothing flagged for your squad right now.</div> : cockpit.flags.map(f => <FlagRow key={f.id} f={f} />)}
            <div style={{ fontSize: 11, color: DIM, marginTop: 8, lineHeight: 1.5 }}>Form is the latest heating or cooling signal on file. Ranks are among hitters with 100+ plate appearances and pitchers with 30+ innings. Flags describe what has happened, with the sample behind it; they are not forecasts. Sources: MLB, Baseball Savant.</div>
          </div>
        </div>
      )}
    </section>
  )
}
export { C, GREY }
