// src/components/admin/story-v5/remotion/ui.tsx
//
// Shared pieces: theme context, Frame (background + glow + footer), Kicker, Head, Pill, SlowTag, Headshot.
// Red Hat is the only font (numbers use tabular figures). Images use Remotion's <Img> so a frame never renders before its image has loaded.

import { createContext, useContext, type CSSProperties, type ReactNode } from 'react'
import { AbsoluteFill, Img } from 'remotion'
import { loadFont } from '@remotion/google-fonts/RedHatDisplay'
import { Flip } from './anim'
import { FOOTER_BOTTOM, MARGIN, THEMES, TITLE_TOP, type Theme } from './config'
import type { TeamInfo } from '../types'

export const { fontFamily: FONT } = loadFont('normal', { weights: ['400', '600', '700', '800'], subsets: ['latin'] })
export const NUM: CSSProperties = { fontVariantNumeric: 'tabular-nums' }

import type { PreviewData } from '../types'
import { resolveTitles, type Resolved, type TitleOpts, type Titles } from './titles'
import type { SceneId } from './config'
import { getOpt, type Look, type OptValue, type SlideOptions } from './options'

const ThemeCtx = createContext<Theme>(THEMES.paper)
const TitlesCtx = createContext<Titles | undefined>(undefined)
const OptsCtx = createContext<SlideOptions | undefined>(undefined)
export const OptionsProvider = OptsCtx.Provider
/** A slide option (what it shows): your choice, else the default from options.ts. */
export function useOpt(id: SceneId, key: string): OptValue { return getOpt(useContext(OptsCtx), id, key) }
export function useOptBool(id: SceneId, key: string): boolean { return useOpt(id, key) === true }
export function useOptNum(id: SceneId, key: string): number { return Number(useOpt(id, key)) }
export const TitlesProvider = TitlesCtx.Provider
/** The words for a slide: your change if you typed one, else the default. */
export function useTitles(id: SceneId, data: PreviewData, opts: TitleOpts = {}): Resolved { return resolveTitles(id, data, useContext(TitlesCtx), opts) }
export const ThemeProvider = ThemeCtx.Provider
export const useTheme = () => useContext(ThemeCtx)

/** Logos on every slide when the look asks for it: a small strip at the top right, and/or faint big logos behind the slide. */
function LogoStrip({ teams, look, footerLabel }: { teams: { away: TeamInfo; home: TeamInfo }; look: Look; footerLabel: string }) {
  const t = useTheme()
  const disc = (team: TeamInfo, size: number) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, borderRadius: '50%', background: '#fff', border: `2px solid ${t.line}`, boxSizing: 'border-box' }}>
      <Img src={team.logo} style={{ width: size * 0.72, height: size * 0.72, objectFit: 'contain' }} />
    </span>
  )
  return (
    <>
      {look.watermark ? (
        <>
          <Img src={teams.away.logo} style={{ position: 'absolute', left: -150, top: 640, width: 620, height: 620, objectFit: 'contain', opacity: t.name === 'dark' ? 0.07 : 0.06 }} />
          <Img src={teams.home.logo} style={{ position: 'absolute', right: -150, top: 340, width: 620, height: 620, objectFit: 'contain', opacity: t.name === 'dark' ? 0.07 : 0.06 }} />
        </>
      ) : null}
      {look.header === 'logos' ? (
        <div style={{ position: 'absolute', right: MARGIN, top: 14, display: 'flex', gap: 10 }}>{disc(teams.away, 58)}{disc(teams.home, 58)}</div>
      ) : look.header === 'matchup' ? (
        <div style={{ position: 'absolute', right: MARGIN, top: 14, display: 'flex', alignItems: 'center', gap: 10, fontSize: 26, fontWeight: 800, color: t.dim }}>
          {disc(teams.away, 50)}<span>{teams.away.abbr} at {teams.home.abbr}</span>{disc(teams.home, 50)}<span style={{ fontWeight: 600, letterSpacing: 1 }}>{footerLabel}</span>
        </div>
      ) : null}
    </>
  )
}

export function Frame({ footerLeft, teams, look, children }: { footerLeft: string; teams?: { away: TeamInfo; home: TeamInfo }; look?: Look; children: ReactNode }) {
  const t = useTheme()
  const gameTag = /\bG\d+\b/.exec(footerLeft)?.[0] ?? ''
  return (
    <AbsoluteFill style={{ background: t.bg, color: t.text, fontFamily: FONT }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 40%, ${t.glow}, transparent 60%)` }} />
      {teams && look ? <LogoStrip teams={teams} look={look} footerLabel={gameTag} /> : null}
      {children}
      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, bottom: FOOTER_BOTTOM, display: 'flex', justifyContent: 'space-between', fontSize: 24, letterSpacing: 2, color: t.dim, fontWeight: 600, textTransform: 'uppercase' }}>
        <span>{footerLeft}</span><span style={{ textTransform: 'none' }}>x9<span style={{ color: t.accent }}>Lab</span></span>
      </div>
    </AbsoluteFill>
  )
}

export function Kicker({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const t = useTheme()
  return <Flip delay={delay}><div style={{ color: t.accent, fontSize: 30, letterSpacing: 4, fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{children}</div></Flip>
}
export function Head({ children, delay = 4, size = 64 }: { children: ReactNode; delay?: number; size?: number }) {
  return <Flip delay={delay}><div style={{ fontSize: size, fontWeight: 800, lineHeight: 1.02, letterSpacing: -1 }}>{children}</div></Flip>
}
/** Title block: kicker then headline, starting at top 90 with 100px side margins. */
export function Title({ kicker, head, size }: { kicker: ReactNode; head: ReactNode; size?: number }) {
  return (
    <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: TITLE_TOP, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Kicker>{kicker}</Kicker><Head size={size}>{head}</Head>
    </div>
  )
}

export function Pill({ team, label, size = 34 }: { team: TeamInfo; label?: ReactNode; size?: number }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.3, background: team.primary, color: team.light, border: `${Math.max(2, size / 14)}px solid ${team.light}`, borderRadius: 999, padding: `${size * 0.14}px ${size * 0.5}px ${size * 0.14}px ${size * 0.28}px`, fontWeight: 800, fontSize: size, letterSpacing: 1, lineHeight: 1.1, whiteSpace: 'nowrap', ...NUM }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size * 1.2, height: size * 1.2, borderRadius: '50%', background: '#fff', flex: '0 0 auto' }}>
        <Img src={team.logo} style={{ height: size * 0.95, width: size * 0.95, objectFit: 'contain' }} />
      </span>
      <span>{label ?? team.abbr}</span>
    </div>
  )
}

export function Headshot({ src, size, border, badge }: { src: string; size: number; border: string; badge?: string }) {
  const t = useTheme()
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', border: `${Math.max(3, size / 28)}px solid ${border}`, background: t.card, boxSizing: 'border-box' }}>
        <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
      </div>
      {badge ? <div style={{ position: 'absolute', right: -size * 0.06, bottom: -size * 0.04, width: size * 0.36, height: size * 0.36, borderRadius: '50%', background: t.card, border: `2px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Img src={badge} style={{ width: '72%', height: '72%', objectFit: 'contain' }} /></div> : null}
    </div>
  )
}

export const upper = (s: string) => s.toUpperCase()
