// src/lib/postgame/cards/frame.tsx
//
// The shared frame for the X graphics (1600×900, X's 16:9 in-feed size): brand colours, Bebas Neue display + JetBrains
// Mono data type, zero border-radius, a "§ POSTGAME REPORT" eyebrow, the matchup + final score at the right and a
// black footer bar. Rendered by next/og (Satori), which only does flexbox and has no text inside inline SVG, so charts
// are SVG shapes with their labels laid over them as absolutely-positioned divs.
// House rules for anything that goes on a card: factor/fact language only, no raw Edge Score, no picks or odds; the
// footer carries the brand, never a link (links go in the reply, not the post).

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const W = 1600, H = 900
export const C = { cream: '#FAF8F3', ink: '#1A1A1A', orange: '#FF5722', yellow: '#FDE047', stone: '#78716c', line: '#d6d3d1', soft: '#efece4', blue: '#2a78d6' }
export const SIDE = { away: C.orange, home: C.blue } as const
export const BEBAS = 'Bebas Neue', MONO = 'JetBrains Mono'

const dir = join(process.cwd(), 'src/lib/postgame/cards/fonts')
export async function loadFonts() {
  const [bebas, mono, monoBold] = await Promise.all([
    readFile(join(dir, 'BebasNeue-Regular.ttf')), readFile(join(dir, 'JetBrainsMono-Regular.ttf')), readFile(join(dir, 'JetBrainsMono-Bold.ttf')),
  ])
  const ab = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
  return [
    { name: BEBAS, data: ab(bebas), weight: 400 as const, style: 'normal' as const },
    { name: MONO, data: ab(mono), weight: 400 as const, style: 'normal' as const },
    { name: MONO, data: ab(monoBold), weight: 700 as const, style: 'normal' as const },
  ]
}

export type FrameProps = {
  title: string
  sub?: string
  away: { abbr: string; runs: number }; home: { abbr: string; runs: number }
  final: string
  children: React.ReactNode
}

export function Frame({ title, sub, away, home, final, children }: FrameProps) {
  return (
    <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', background: C.cream, color: C.ink, fontFamily: MONO }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '40px 56px 18px', borderBottom: `4px solid ${C.ink}` }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 20, fontWeight: 700, letterSpacing: 3, color: C.orange }}>{'§ POSTGAME REPORT'}</div>
          <div style={{ display: 'flex', fontFamily: BEBAS, fontSize: 92, lineHeight: 1, marginTop: 4 }}>{title}</div>
          {sub ? <div style={{ display: 'flex', fontSize: 22, color: C.stone, marginTop: 6 }}>{sub}</div> : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontFamily: BEBAS, fontSize: 64, lineHeight: 1 }}>
          <div style={{ display: 'flex', color: SIDE.away }}>{away.abbr}</div><div style={{ display: 'flex' }}>{String(away.runs)}</div>
          <div style={{ display: 'flex', fontFamily: MONO, fontSize: 18, color: C.stone, letterSpacing: 2 }}>{final.toUpperCase()}</div>
          <div style={{ display: 'flex' }}>{String(home.runs)}</div><div style={{ display: 'flex', color: SIDE.home }}>{home.abbr}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flex: 1, padding: '26px 56px 20px' }}>{children}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.ink, color: C.cream, padding: '0 56px', height: 64 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <div style={{ display: 'flex', fontFamily: BEBAS, fontSize: 40, letterSpacing: 2 }}>THE EDGE</div>
          <div style={{ display: 'flex', fontSize: 18, color: C.yellow }}>edgereportdaily.com</div>
        </div>
        <div style={{ display: 'flex', fontSize: 16, color: '#a8a29e' }}>Information, not advice.</div>
      </div>
    </div>
  )
}

export const label = (extra?: object) => ({ display: 'flex', fontSize: 16, letterSpacing: 2, color: C.stone, fontWeight: 700, ...extra })
export const box = { display: 'flex', flexDirection: 'column' as const, background: '#fff', border: `2px solid ${C.ink}`, padding: '12px 16px' }
