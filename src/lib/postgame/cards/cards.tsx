// src/lib/postgame/cards/cards.tsx
//
// One builder per X graphic. Each takes the shared PostData (and reads whatever else its section reads) and returns the
// card's JSX inside <Frame>. They reuse the section libraries, so a card can never disagree with the page it comes from.
// Available: final, swing, performers, umpire, abs, contact, starters, leverage.

import type { PostData } from '../data'
import { buildHeader, buildSwing, buildPerformers, type Side } from '../recap'
import { buildUmpires } from '../umpires'
import { buildAbs } from '../abs'
import { getContact } from '../contact'
import { getStarterNights } from '../starters'
import { buildLeverage, HIGH_LI } from '../leverage'
import { Frame, C, SIDE, DISPLAY, label, box } from './frame'

export type CardKind = 'final' | 'swing' | 'performers' | 'umpire' | 'abs' | 'contact' | 'starters' | 'leverage'
export const CARD_KINDS: CardKind[] = ['final', 'swing', 'performers', 'umpire', 'abs', 'contact', 'starters', 'leverage']

const ord = (i: number) => { const v = i % 100; return `${i}${v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[i % 10] ?? 'th'}` }
const sur = (n: string) => n.trim().split(/\s+/).slice(-1)[0]
const F = (s: object) => ({ display: 'flex', ...s })

function Tile({ k, v, sub, w }: { k: string; v: string; sub?: string; w?: number }) {
  return (
    <div style={{ ...box, ...(w ? { width: w } : { flex: 1 }) }}>
      <div style={label()}>{k.toUpperCase()}</div>
      <div style={F({ fontFamily: DISPLAY, fontWeight: 800, letterSpacing: -1, fontSize: 53, lineHeight: 1, marginTop: 2 })}>{v}</div>
      {sub ? <div style={F({ fontSize: 16, color: C.stone, marginTop: 2 })}>{sub}</div> : null}
    </div>
  )
}

export async function buildCard(kind: CardKind, d: PostData, gameDate: string): Promise<React.ReactElement | null> {
  const h = buildHeader(d)
  const fr = { away: { abbr: h.away.abbr, runs: h.away.runs }, home: { abbr: h.home.abbr, runs: h.home.runs }, final: h.finalText }
  const abbr = { away: h.away.abbr, home: h.home.abbr }

  // ───────────────────────── final ─────────────────────────
  if (kind === 'final') {
    const cols = h.linescore.away.length
    const cell = (v: string, bold?: boolean, color?: string) => <div style={F({ width: 66, justifyContent: 'center', fontSize: 30, fontWeight: bold ? 700 : 400, color: color ?? C.ink })}>{v}</div>
    const row = (s: Side) => (
      <div style={F({ alignItems: 'center', height: 74, borderBottom: `1px solid ${C.line}` })}>
        <div style={F({ width: 150, fontFamily: DISPLAY, fontWeight: 800, letterSpacing: -1, fontSize: 43, color: SIDE[s] })}>{abbr[s]}</div>
        {h.linescore[s].map((r, i) => <div key={i} style={F({ display: 'flex' })}>{cell(r == null ? '–' : String(r))}</div>)}
        <div style={F({ width: 24 })} />{cell(String(h[s].runs), true)}{cell(String(h[s].hits), true)}{cell(String(h[s].errors), true)}
      </div>
    )
    return (
      <Frame title="THE FINAL" sub={`${h.venue} · ${h.date}`} {...fr}>
        <div style={F({ flexDirection: 'column', flex: 1, justifyContent: 'space-between' })}>
          <div style={F({ flexDirection: 'column' })}>
            <div style={F({ alignItems: 'center', height: 40, color: C.stone, fontSize: 20 })}>
              <div style={F({ width: 150 })} />{Array.from({ length: cols }, (_, i) => <div key={i} style={F({ width: 66, justifyContent: 'center' })}>{String(i + 1)}</div>)}<div style={F({ width: 24 })} />{['R', 'H', 'E'].map((x) => <div key={x} style={F({ width: 66, justifyContent: 'center', fontWeight: 700, color: C.ink })}>{x}</div>)}
            </div>
            {row('away')}{row('home')}
          </div>
          <div style={F({ fontFamily: DISPLAY, fontWeight: 800, letterSpacing: -1, fontSize: 56, lineHeight: 1.05 })}>{h.read}</div>
          <div style={F({ gap: 48, fontSize: 22 })}>
            {h.decisions.w ? <div style={F({ gap: 10 })}><b>W</b>{h.decisions.w}</div> : null}
            {h.decisions.l ? <div style={F({ gap: 10 })}><b>L</b>{h.decisions.l}</div> : null}
            {h.decisions.s ? <div style={F({ gap: 10 })}><b>SV</b>{h.decisions.s}</div> : null}
            {h.series ? <div style={F({ gap: 10, color: C.orange, fontWeight: 700 })}>{h.series}</div> : null}
          </div>
        </div>
      </Frame>
    )
  }

  // ───────────────────────── swing ─────────────────────────
  if (kind === 'swing') {
    const sw = buildSwing(d); if (!sw) return null
    const cw = 1488, ch = 390, n = sw.points.length
    const x = (i: number) => (i / (n - 1)) * cw, y = (wp: number) => ((100 - wp) / 100) * ch
    const pts = [{ i: 0, homeWp: sw.start }, ...sw.points.map((p) => ({ i: p.i, homeWp: p.homeWp }))]
    const line = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(p.homeWp).toFixed(1)}`).join(' ')
    const areaFor = (up: boolean) => `M${x(0)} ${y(50)} ` + pts.map((p) => `L${x(p.i).toFixed(1)} ${y(up ? Math.max(p.homeWp, 50) : Math.min(p.homeWp, 50)).toFixed(1)}`).join(' ') + ` L${x(n - 1)} ${y(50)} Z`
    return (
      <Frame title="HOW THE GAME SWUNG" sub="Win probability after every plate appearance" {...fr}>
        <div style={F({ flexDirection: 'column', flex: 1 })}>
          <div style={F({ position: 'relative', width: cw, height: ch, background: '#fff', border: `2px solid ${C.ink}` })}>
            <svg width={cw} height={ch} viewBox={`0 0 ${cw} ${ch}`} style={{ position: 'absolute', left: 0, top: 0 }}>
              <line x1={0} x2={cw} y1={y(50)} y2={y(50)} stroke={C.stone} strokeWidth={2} strokeDasharray="8 6" />
              <path d={areaFor(true)} fill={SIDE.home} fillOpacity={0.25} /><path d={areaFor(false)} fill={SIDE.away} fillOpacity={0.25} />
              <path d={line} fill="none" stroke={C.ink} strokeWidth={4} />
              {sw.inflections.map((f) => <circle key={f.n} cx={x(f.i)} cy={y(f.homeWp)} r={18} fill={C.ink} stroke={C.yellow} strokeWidth={4} />)}
            </svg>
            {sw.inflections.map((f) => <div key={f.n} style={F({ position: 'absolute', left: x(f.i) - 18, top: y(f.homeWp) - 18, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', color: C.yellow, fontWeight: 700, fontSize: 22 })}>{String(f.n)}</div>)}
            <div style={F({ position: 'absolute', left: 12, top: 8, fontSize: 18, fontWeight: 700, color: SIDE.home })}>{`${abbr.home} ahead`}</div>
            <div style={F({ position: 'absolute', left: 12, bottom: 8, fontSize: 18, fontWeight: 700, color: SIDE.away })}>{`${abbr.away} ahead`}</div>
          </div>
          <div style={F({ gap: 20, marginTop: 20 })}>
            {sw.inflections.slice(0, 3).map((f) => (
              <div key={f.n} style={{ ...box, flex: 1 }}>
                <div style={F({ alignItems: 'center', gap: 12 })}>
                  <div style={F({ width: 38, height: 38, background: C.ink, color: C.yellow, alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 22 })}>{String(f.n)}</div>
                  <div style={label({ color: C.orange })}>{`${f.top ? 'TOP' : 'BOT'} ${f.inning} · ${f.kind} · ${abbr[f.helped]} +${Math.round(f.gain)} PTS`}</div>
                </div>
                <div style={F({ fontSize: 20, lineHeight: 1.25, marginTop: 10 })}>{f.text.length > 105 ? `${f.text.slice(0, 102)}…` : f.text}</div>
              </div>
            ))}
          </div>
        </div>
      </Frame>
    )
  }

  // ───────────────────────── performers ─────────────────────────
  if (kind === 'performers') {
    const p = buildPerformers(d); if (!p) return null
    const chipBg = { Decisive: C.orange, Solid: C.yellow, Quiet: '#e7e5e4' } as const
    const col = (title: string, list: typeof p.batters) => (
      <div style={F({ flexDirection: 'column', flex: 1, gap: 14 })}>
        <div style={label({ fontSize: 22 })}>{title}</div>
        {list.map((c) => (
          <div key={c.id} style={{ ...box, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 148 }}>
            <div style={F({ flexDirection: 'column' })}>
              <div style={F({ alignItems: 'baseline', gap: 12 })}><div style={F({ fontFamily: DISPLAY, fontWeight: 800, letterSpacing: -1, fontSize: 50, lineHeight: 1 })}>{c.name}</div><div style={F({ fontSize: 20, color: SIDE[c.side], fontWeight: 700 })}>{abbr[c.side]}</div></div>
              <div style={F({ fontSize: 26, marginTop: 4 })}>{c.line}</div>
            </div>
            <div style={F({ flexDirection: 'column', alignItems: 'flex-end', gap: 6 })}>
              <div style={F({ background: chipBg[c.label], color: c.label === 'Decisive' ? '#fff' : C.ink, padding: '6px 14px', fontWeight: 700, fontSize: 20, letterSpacing: 2 })}>{c.label.toUpperCase()}</div>
              <div style={F({ fontSize: 18, color: C.stone })}>{`${c.wpa >= 0 ? '+' : '−'}${Math.abs(c.wpa).toFixed(0)} pts win prob.`}</div>
            </div>
          </div>
        ))}
      </div>
    )
    return (
      <Frame title="TOP PERFORMERS" sub="Ranked by win probability added, this game only" {...fr}>
        <div style={F({ gap: 28, flex: 1 })}>{col('BATTERS', p.batters)}{col('PITCHERS', p.pitchers)}</div>
      </Frame>
    )
  }

  // ───────────────────────── umpire ─────────────────────────
  if (kind === 'umpire') {
    const u = buildUmpires(d); const pl = u.plate; if (!pl) return null
    const S = 120, X0 = -2.1, Z0 = 0.2, pw = 504, ph = 552
    const sx = (v: number) => (v - X0) * S, sz = (v: number) => ph - (v - Z0) * S
    const helped = { away: pl.misses.filter((m) => m.helped === 'away').length, home: pl.misses.filter((m) => m.helped === 'home').length }
    const worst = [...pl.misses].sort((a, b) => b.inches - a.inches).slice(0, 4)
    return (
      <Frame title="UMPIRE REPORT" sub={`${pl.name} behind the plate · every ball and strike, catcher's view`} {...fr}>
        <div style={F({ gap: 36, flex: 1 })}>
          <div style={F({ position: 'relative', width: pw, height: ph, background: '#fff', border: `2px solid ${C.ink}` })}>
            <svg width={pw} height={ph} viewBox={`0 0 ${pw} ${ph}`} style={{ position: 'absolute', left: 0, top: 0 }}>
              <rect x={sx(-0.83)} y={sz(pl.zoneTop)} width={sx(0.83) - sx(-0.83)} height={sz(pl.zoneBottom) - sz(pl.zoneTop)} fill="#fff" stroke={C.ink} strokeWidth={3} />
              {pl.points.filter((q) => !q.missed).map((q, i) => <circle key={i} cx={sx(q.x)} cy={sz(q.z)} r={5} fill={q.call === 'strike' ? C.orange : '#a8a29e'} fillOpacity={0.45} />)}
              {pl.points.filter((q) => q.missed).map((q, i) => <circle key={`m${i}`} cx={sx(q.x)} cy={sz(q.z)} r={11} fill={q.call === 'strike' ? C.orange : '#a8a29e'} stroke={C.ink} strokeWidth={3.5} />)}
            </svg>
          </div>
          <div style={F({ flexDirection: 'column', flex: 1, gap: 14 })}>
            <div style={F({ alignItems: 'flex-end', gap: 20 })}>
              <div style={F({ fontFamily: DISPLAY, fontWeight: 800, letterSpacing: -1, fontSize: 139, lineHeight: 0.9 })}>{`${pl.accuracyPct.toFixed(1)}%`}</div>
              <div style={F({ flexDirection: 'column', paddingBottom: 12 })}><div style={label({ fontSize: 20 })}>CALL ACCURACY</div><div style={F({ fontSize: 22 })}>{`${pl.takes - pl.missed} of ${pl.takes} calls right`}</div></div>
            </div>
            <div style={F({ gap: 14 })}>
              <Tile k="Balls called strikes" v={String(pl.extraStrikes)} />
              <Tile k="Strikes called balls" v={String(pl.lostStrikes)} />
              <Tile k="Fixed by ABS" v={String(pl.overturned)} />
            </div>
            {pl.missed > 0 ? (
              <div style={F({ flexDirection: 'column', gap: 6 })}>
                <div style={label()}>WHO THE MISSES HELPED</div>
                <div style={F({ height: 40, fontWeight: 700, fontSize: 22, color: '#fff' })}>
                  {helped.away > 0 ? <div style={F({ flex: helped.away, background: SIDE.away, alignItems: 'center', justifyContent: 'center' })}>{`${abbr.away} ${helped.away}`}</div> : null}
                  {helped.home > 0 ? <div style={F({ flex: helped.home, background: SIDE.home, alignItems: 'center', justifyContent: 'center' })}>{`${abbr.home} ${helped.home}`}</div> : null}
                </div>
              </div>
            ) : null}
            <div style={F({ flexDirection: 'column', gap: 4, flex: 1 })}>
              <div style={label()}>BIGGEST MISSES</div>
              {worst.map((m, i) => <div key={i} style={F({ justifyContent: 'space-between', fontSize: 21, borderBottom: `1px solid ${C.line}`, paddingBottom: 4 })}><div style={F({})}>{`${m.top ? 'Top' : 'Bot'} ${ord(m.inning)} · ${sur(m.batter)} vs ${sur(m.pitcher)}`}</div><div style={F({ fontWeight: 700 })}>{`${m.call === 'strike' ? 'ball→strike' : 'strike→ball'} · ${m.inches.toFixed(1)}″`}</div></div>)}
            </div>
          </div>
        </div>
      </Frame>
    )
  }

  // ───────────────────────── abs ─────────────────────────
  if (kind === 'abs') {
    const a = buildAbs(d); if (a.challenges.length === 0) return null
    const sw = buildSwing(d)
    const cw = 1488, chh = 170
    const chal = a.challenges.slice(0, 8)
    return (
      <Frame title="ABS CHALLENGES" sub="Who challenged, when, and how it ended" {...fr}>
        <div style={F({ flexDirection: 'column', flex: 1, gap: 16 })}>
          <div style={F({ gap: 14 })}>
            {a.sides.map((s) => <Tile key={s.side} k={`${abbr[s.side]} overturned`} v={`${s.successful} of ${s.used}`} sub={s.remaining != null ? `${s.remaining} challenge${s.remaining === 1 ? '' : 's'} left` : undefined} w={300} />)}
            <div style={F({ flex: 1 })} />
          </div>
          {sw ? (() => {
            const pad = 30, seen = new Map<number, number>()
            const mk = chal.filter((c) => c.wpIndex != null).map((c) => {
              const k2 = seen.get(c.wpIndex as number) ?? 0; seen.set(c.wpIndex as number, k2 + 1)
              return { c, cx: pad + ((c.wpIndex as number) / (sw.points.length - 1)) * (cw - 2 * pad) + k2 * 36, cy: 26 + ((100 - sw.points[c.wpIndex as number].homeWp) / 100) * (chh - 52) }
            })
            return (
              <div style={F({ position: 'relative', width: cw, height: chh, background: '#fff', border: `2px solid ${C.ink}` })}>
                <svg width={cw} height={chh} viewBox={`0 0 ${cw} ${chh}`} style={{ position: 'absolute', left: 0, top: 0 }}>
                  <line x1={0} x2={cw} y1={chh / 2} y2={chh / 2} stroke={C.line} strokeWidth={2} strokeDasharray="8 6" />
                  <path d={sw.points.map((p, k) => `${k ? 'L' : 'M'}${(pad + (p.i / (sw.points.length - 1)) * (cw - 2 * pad)).toFixed(1)} ${(26 + ((100 - p.homeWp) / 100) * (chh - 52)).toFixed(1)}`).join(' ')} fill="none" stroke="#a8a29e" strokeWidth={3} />
                  {mk.map(({ c, cx, cy }) => <circle key={c.n} cx={cx} cy={cy} r={17} fill={c.overturned ? SIDE[c.side] : '#fff'} stroke={SIDE[c.side]} strokeWidth={4} />)}
                </svg>
                {mk.map(({ c, cx, cy }) => <div key={c.n} style={F({ position: 'absolute', left: cx - 17, top: cy - 17, width: 34, height: 34, alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 20, color: c.overturned ? '#fff' : SIDE[c.side] })}>{String(c.n)}</div>)}
              </div>
            )
          })() : null}
          <div style={F({ flexWrap: 'wrap', gap: 10 })}>
            {chal.map((c) => (
              <div key={c.n} style={{ ...box, width: 739, flexDirection: 'row', alignItems: 'center', gap: 14, padding: '8px 14px' }}>
                <div style={F({ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 22, background: c.overturned ? SIDE[c.side] : '#fff', color: c.overturned ? '#fff' : SIDE[c.side], border: `3px solid ${SIDE[c.side]}` })}>{String(c.n)}</div>
                <div style={F({ flexDirection: 'column', flex: 1 })}>
                  <div style={F({ fontSize: 20, fontWeight: 700 })}>{`${c.who.name} · ${c.who.role.toLowerCase()}`}</div>
                  <div style={F({ fontSize: 17, color: C.stone })}>{`${c.top ? 'Top' : 'Bot'} ${ord(c.inning)} · ${c.count} · ${c.originalCall.toLowerCase()}${c.overturned ? ` → ${c.finalCall.toLowerCase()}` : ''}`}</div>
                </div>
                <div style={F({ fontWeight: 700, fontSize: 18, color: c.overturned ? C.orange : C.stone })}>{c.overturned ? 'OVERTURNED' : 'STOOD'}</div>
              </div>
            ))}
          </div>
        </div>
      </Frame>
    )
  }

  // ───────────────────────── contact ─────────────────────────
  if (kind === 'contact') {
    const sides = await getContact(d, gameDate); if (sides.every((s) => s.balls.length === 0)) return null
    const FW = 480, k = FW / 250, Y0 = 34, FH = Math.round((214 - Y0) * k)   // grid units → px; the top 34 units of the grid are above the fence
    const HXp = 125, HYp = 204, U = 0.42
    const P = (dx: number, dy: number) => `${((HXp + dx * U) * k).toFixed(1)},${((HYp - dy * U - Y0) * k).toFixed(1)}`
    const fence = 400, rad = fence * U * k
    const a = (deg: number) => [Math.sin((deg * Math.PI) / 180) * fence, Math.cos((deg * Math.PI) / 180) * fence] as const
    const [lx, ly] = a(-45), [rx, ry] = a(45)
    const field = (s: (typeof sides)[number]) => (
      <div style={F({ position: 'relative', width: FW, height: FH, background: '#fff', border: `2px solid ${C.ink}` })}>
        <svg width={FW} height={FH} viewBox={`0 0 ${FW} ${FH}`} style={{ position: 'absolute', left: 0, top: 0 }}>
          <path d={`M${P(0, 0)} L${P(lx, ly)} A${rad},${rad} 0 0 1 ${P(rx, ry)} Z`} fill={C.soft} stroke={C.line} strokeWidth={2} />
          <path d={`M${P(0, 0)} L${P(63.6, 63.6)} L${P(0, 127.3)} L${P(-63.6, 63.6)} Z`} fill="#e4dfd0" stroke="#c9c4b6" strokeWidth={2} />
          {s.balls.map((b, i) => <circle key={i} cx={b.x * k} cy={(b.y - Y0) * k} r={b.hard ? 9 : 6.5} fill={b.hit ? SIDE[s.side] : '#fff'} stroke={b.barrel ? C.ink : b.hit ? SIDE[s.side] : C.stone} strokeWidth={b.barrel ? 3.5 : 2} />)}
        </svg>
      </div>
    )
    const col = (s: (typeof sides)[number]) => {
      const hp = s.bbe ? (s.hardHit / s.bbe) * 100 : null, bp = s.bbe ? (s.barrels / s.bbe) * 100 : null
      const top = [...s.balls].filter((b) => b.ev != null).sort((x, y) => (y.ev as number) - (x.ev as number)).slice(0, 3)
      return (
        <div key={s.side} style={F({ flexDirection: 'column', gap: 14, flex: 1 })}>
          <div style={F({ fontFamily: DISPLAY, fontWeight: 800, letterSpacing: -1, fontSize: 46, color: SIDE[s.side], lineHeight: 1 })}>{`${abbr[s.side]} BATTING`}</div>
          <div style={F({ gap: 16 })}>
            {field(s)}
            <div style={F({ flexDirection: 'column', gap: 10, flex: 1 })}>
              <Tile k="Hard-hit 95+" v={hp != null ? `${hp.toFixed(0)}%` : '—'} sub={s.seasonHardPct != null ? `season ${s.seasonHardPct.toFixed(1)}%` : `${s.hardHit} of ${s.bbe}`} />
              <Tile k="Barrels" v={bp != null ? `${bp.toFixed(0)}%` : '—'} sub={s.seasonBarrelPct != null ? `season ${s.seasonBarrelPct.toFixed(1)}%` : `${s.barrels} of ${s.bbe}`} />
            </div>
          </div>
          <div style={F({ flexDirection: 'column', gap: 6 })}>
            <div style={label()}>HARDEST HIT</div>
            {top.map((b, i) => <div key={i} style={F({ justifyContent: 'space-between', fontSize: 22, borderBottom: `1px solid ${C.line}`, paddingBottom: 4 })}><div style={F({})}>{`${sur(b.batter)} · ${b.result}`}</div><div style={F({ fontWeight: 700 })}>{`${(b.ev as number).toFixed(1)} mph${b.barrel ? ' · barrel' : ''}`}</div></div>)}
          </div>
        </div>
      )
    }
    return (
      <Frame title="SPRAY & CONTACT" sub="Every ball in play · filled = hit · larger = 95+ mph · black ring = barrel" {...fr}>
        <div style={F({ gap: 32, flex: 1 })}>{sides.map(col)}</div>
      </Frame>
    )
  }

  // ───────────────────────── starters ─────────────────────────
  if (kind === 'starters') {
    const st = await getStarterNights(d, gameDate); if (st.length === 0) return null
    const col = (s: (typeof st)[number]) => (
      <div key={s.id} style={{ ...box, flex: 1, gap: 8 }}>
        <div style={F({ alignItems: 'baseline', gap: 12 })}><div style={F({ fontFamily: DISPLAY, fontWeight: 800, letterSpacing: -1, fontSize: 46, lineHeight: 1 })}>{s.name}</div><div style={F({ fontSize: 22, color: SIDE[s.side], fontWeight: 700 })}>{abbr[s.side]}</div></div>
        <div style={F({ fontSize: 22 })}>{`${s.line.ip} IP · ${s.line.h} H · ${s.line.er} ER · ${s.line.bb} BB · ${s.line.k} K · ${s.line.pitches} pitches`}</div>
        <div style={F({ fontSize: 20, lineHeight: 1.25, color: C.ink, minHeight: 50 })}>{s.read}</div>
        <div style={F({ flexDirection: 'column', gap: 16, marginTop: 10 })}>
          {s.mix.slice(0, 6).map((m) => (
            <div key={m.code} style={F({ alignItems: 'center', gap: 12 })}>
              <div style={F({ width: 170, fontSize: 24, fontWeight: 700 })}>{m.name}</div>
              <div style={F({ flexDirection: 'column', flex: 1, gap: 3 })}>
                <div style={F({ height: 26, background: '#efece4' })}><div style={{ display: 'flex', width: `${Math.min(100, m.tonightPct)}%`, background: SIDE[s.side] }} /></div>
                <div style={F({ height: 14, background: '#f5f3ee' })}>{m.usualPct != null ? <div style={{ display: 'flex', width: `${Math.min(100, m.usualPct)}%`, background: '#a8a29e' }} /> : null}</div>
              </div>
              <div style={F({ width: 170, justifyContent: 'flex-end', gap: 8, fontSize: 24 })}><div style={F({ fontWeight: 700 })}>{`${m.tonightN > 0 ? Math.round(m.tonightPct) : 0}%`}</div><div style={F({ color: C.stone })}>{`/ ${m.usualPct != null ? `${Math.round(m.usualPct)}%` : '—'}`}</div></div>
            </div>
          ))}
        </div>
      </div>
    )
    return (
      <Frame title="STARTERS: PLAN VS NIGHT" sub="Colour bar = tonight's pitch mix · grey bar = his usual (season) mix" {...fr}>
        <div style={F({ gap: 28, flex: 1 })}>{st.map(col)}</div>
      </Frame>
    )
  }

  // ───────────────────────── leverage ─────────────────────────
  if (kind === 'leverage') {
    const lv = buildLeverage(d); if (!lv || lv.high === 0) return null   // a blowout with no high-leverage spot has no story to tell
    const cw = 1488, chh = 300, n = lv.pas.length, bw = cw / n, ymax = Math.max(3, Math.ceil(lv.peak))
    const catColor = { hr: C.orange, hit: C.yellow, walk: '#78716c', k: C.ink, out: '#e7e5e4', other: '#e7e5e4' } as const
    return (
      <Frame title="LEVERAGE TIMELINE" sub={`How much every plate appearance mattered · ${lv.high} of ${lv.total} were high leverage (${HIGH_LI.toFixed(1)}+)`} {...fr}>
        <div style={F({ flexDirection: 'column', flex: 1, gap: 14 })}>
          <div style={F({ position: 'relative', width: cw, height: chh + 26, background: '#fff', border: `2px solid ${C.ink}` })}>
            <svg width={cw} height={chh + 26} viewBox={`0 0 ${cw} ${chh + 26}`} style={{ position: 'absolute', left: 0, top: 0 }}>
              <line x1={0} x2={cw} y1={chh - (HIGH_LI / ymax) * chh} y2={chh - (HIGH_LI / ymax) * chh} stroke={C.stone} strokeWidth={2} strokeDasharray="8 6" />
              {lv.pas.map((p, i) => <rect key={i} x={i * bw + 1} y={chh - (p.li / ymax) * chh} width={Math.max(2, bw - 2)} height={(p.li / ymax) * chh} fill={SIDE[p.top ? 'away' : 'home']} fillOpacity={p.li >= HIGH_LI ? 1 : 0.4} />)}
              {lv.pas.map((p, i) => <rect key={`s${i}`} x={i * bw + 1} y={chh + 6} width={Math.max(2, bw - 2)} height={16} fill={catColor[p.cat]} />)}
            </svg>
          </div>
          <div style={F({ gap: 14 })}>
            {lv.top.slice(0, 4).map((p) => (
              <div key={p.i} style={{ ...box, flex: 1, padding: '10px 14px' }}>
                <div style={F({ alignItems: 'center', gap: 10 })}><div style={F({ background: C.ink, color: C.yellow, fontWeight: 700, fontSize: 22, padding: '2px 10px' })}>{p.li.toFixed(1)}</div><div style={label({ fontSize: 15 })}>{`${p.top ? 'TOP' : 'BOT'} ${ord(p.inning)} · ${abbr[p.top ? 'away' : 'home']} BAT`}</div></div>
                <div style={F({ fontSize: 18, lineHeight: 1.25, marginTop: 8 })}>{p.text.length > 88 ? `${p.text.slice(0, 85)}…` : p.text}</div>
              </div>
            ))}
          </div>
        </div>
      </Frame>
    )
  }
  return null
}
