// src/components/admin/story-v5/remotion/scenes/custom.tsx
//
// A custom slide: your small line and headline, then the blocks you added, stacked top to bottom. Blocks with nothing to show are skipped.

import { Img, useCurrentFrame } from 'remotion'
import { Count, Flip, ease, sp } from '../anim'
import { MARGIN, TIMING } from '../config'
import { GAP, blockReady, parseNumber, type Block, type CustomSlide } from '../custom'
import { firstPitchTimes } from '../time'
import { Headshot, NUM, Title, useTheme } from '../ui'
import { teamColor } from './replay'
import type { PreviewData, Side } from '../../types'

const START = 6

function Disc({ data, side, size }: { data: PreviewData; side: Side; size: number }) {
  const t = useTheme()
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, borderRadius: '50%', background: '#fff', border: `${Math.max(2, size / 50)}px solid ${t.line}`, boxSizing: 'border-box', flex: '0 0 auto' }}>
      <Img src={data.teams[side].logo} style={{ width: size * 0.72, height: size * 0.72, objectFit: 'contain' }} />
    </span>
  )
}

/** A value you typed: a number counts up (keeping its sign, decimals and unit), anything else is shown as typed. */
function Typed({ text, from, size, color, weight = 800 }: { text: string; from: number; size: number; color?: string; weight?: number }) {
  const p = parseNumber(text)
  return (
    <span style={{ fontSize: size, fontWeight: weight, color, lineHeight: 1, ...NUM }}>
      {p ? <>{p.prefix}<Count value={p.num} from={from} frames={TIMING.custom.countFrames} fmt={n => n.toFixed(p.decimals)} />{p.suffix}</> : text}
    </span>
  )
}

function BlockView({ b, data, delay }: { b: Block; data: PreviewData; delay: number }) {
  const frame = useCurrentFrame()
  const t = useTheme()
  const s = sp(frame, delay)
  const pop = { opacity: Math.min(1, s * 1.4), transform: `translateY(${(1 - Math.min(1, s)) * 24}px)` }
  switch (b.type) {
    case 'number': {
      const size = Math.max(110, Math.min(190, Math.floor(880 / Math.max(b.value.length * 0.6, 1))))
      return (
        <div style={pop}>
          <div style={{ color: t.accent, letterSpacing: -3 }}><Typed text={b.value} from={delay} size={size} color={t.accent} /></div>
          {b.label.trim() ? <div style={{ fontSize: 34, fontWeight: 600, color: t.dim, marginTop: 8 }}>{b.label}</div> : null}
        </div>
      )
    }
    case 'lines':
      return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{b.lines.filter(l => l.trim()).map((l, i) => <Flip key={i} delay={delay + i * 5}><div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.15 }}>{l}</div></Flip>)}</div>
    case 'logos': {
      const size = b.size === 's' ? 120 : b.size === 'm' ? 190 : 280
      const sides: Side[] = b.teams === 'both' ? ['away', 'home'] : [b.teams]
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: b.teams === 'both' ? 'space-between' : 'flex-start', gap: 30, ...pop }}>
          {sides.map((side, i) => (
            <div key={side} style={{ display: 'contents' }}>
              {i === 1 ? <span style={{ fontSize: 40, fontWeight: 700, color: t.dim }}>at</span> : null}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}><Disc data={data} side={side} size={size} /><span style={{ fontSize: size > 150 ? 36 : 28, fontWeight: 800 }}>{data.teams[side].abbr}</span></div>
            </div>
          ))}
        </div>
      )
    }
    case 'matchup': {
      const fp = firstPitchTimes(data.firstPitch.iso)
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, ...pop }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}><Disc data={data} side="away" size={170} /><span style={{ fontSize: 34, fontWeight: 800 }}>{data.teams.away.abbr}</span></div>
            <span style={{ fontSize: 40, fontWeight: 700, color: t.dim }}>at</span>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}><Disc data={data} side="home" size={170} /><span style={{ fontSize: 34, fontWeight: 800 }}>{data.teams.home.abbr}</span></div>
          </div>
          {b.pitchers ? <div style={{ display: 'flex', justifyContent: 'space-between' }}>{(['away', 'home'] as Side[]).map(side => (
            <div key={side} style={{ display: 'flex', alignItems: 'center', gap: 12, width: 420 }}><Headshot src={data.starters[side].headshot} size={84} border={teamColor(data.teams[side], t.name)} /><div style={{ fontSize: 34, fontWeight: 800 }}>{data.starters[side].last}</div></div>
          ))}</div> : null}
          {b.firstPitch && fp ? <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: 2, color: t.accent, ...NUM }}>{fp.line}</div> : null}
        </div>
      )
    }
    case 'pitchers':
      return (
        <div style={{ display: 'flex', justifyContent: 'space-between', ...pop }}>
          {(['away', 'home'] as Side[]).map(side => (
            <div key={side} style={{ display: 'flex', alignItems: 'center', gap: 16, width: 430 }}>
              <Headshot src={data.starters[side].headshot} size={130} border={teamColor(data.teams[side], t.name)} badge={data.teams[side].logo} />
              <div><div style={{ fontSize: 22, letterSpacing: 2, color: t.dim, fontWeight: 700 }}>{data.teams[side].abbr} {data.starters[side].confirmed ? 'STARTER' : 'PROBABLE'}</div><div style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.05 }}>{data.starters[side].last}</div></div>
            </div>
          ))}
        </div>
      )
    case 'compare': {
      const rows = b.rows.filter(r => r.label.trim() && (r.away.trim() || r.home.trim()))
      return (
        <div style={{ background: t.card, border: `2px solid ${t.line}`, borderRadius: 10, padding: '18px 26px', ...pop }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', alignItems: 'center', paddingBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}><Disc data={data} side="away" size={72} /></div><div />
            <div style={{ display: 'flex', justifyContent: 'center' }}><Disc data={data} side="home" size={72} /></div>
          </div>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', alignItems: 'center', height: 66, borderTop: `2px solid ${t.line}`, opacity: ease(frame, delay + i * 4, delay + i * 4 + 6) }}>
              <div style={{ textAlign: 'center' }}><Typed text={r.away} from={delay + i * 4} size={44} /></div>
              <div style={{ textAlign: 'center', fontSize: 24, fontWeight: 700, color: t.dim, letterSpacing: 1 }}>{r.label}</div>
              <div style={{ textAlign: 'center' }}><Typed text={r.home} from={delay + i * 4} size={44} /></div>
            </div>
          ))}
        </div>
      )
    }
  }
}

export function CustomScene({ c, data }: { c: CustomSlide; data: PreviewData }) {
  const hasTitle = c.kicker.trim() !== '' || c.headline.trim() !== ''
  const blocks = c.blocks.filter(blockReady)
  return (
    <>
      {hasTitle ? <Title kicker={c.kicker.trim() || ' '} head={c.headline} /> : null}
      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: hasTitle ? 330 : 150, display: 'flex', flexDirection: 'column', gap: GAP }}>
        {blocks.map((b, i) => <BlockView key={b.id} b={b} data={data} delay={START + i * 6} />)}
      </div>
    </>
  )
}
