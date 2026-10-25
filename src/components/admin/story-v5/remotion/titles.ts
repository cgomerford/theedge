// src/components/admin/story-v5/remotion/titles.ts
//
// The words on each slide that you can change: the small line above the headline (kicker), the headline, and one extra line
// (hook: the line under the number; bullpens: the closing line; outro: the button). defaultTitles() is the single source of the default
// wording, used by the scenes AND by the admin panel (as placeholders), so what you see in the panel is what the video says.
// An override that is empty or only spaces means "use the default".

import type { SceneId } from './config'
import type { PreviewData, Side } from '../types'

export type TitleOverride = { kicker?: string; headline?: string; extra?: string }
export type Titles = Partial<Record<SceneId, TitleOverride>>
export type Resolved = { kicker: string; headline: string; extra: string; extraLabel: string | null }
export type TitleOpts = { defenseMode?: 'home' | 'away' | 'both'; bullpenMode?: 'lastGame' | 'last3'; scoutTopic?: 'run' | 'late' }

const last = (n: string) => n.trim().split(/\s+/).slice(-1)[0] ?? n
/** Which clubs the defense slides show: the home slide follows the mode, the away slide is always the away club. */
const defenseSide = (id: SceneId, mode: 'home' | 'away' | 'both'): Side => (id === 'defenseAway' ? 'away' : mode === 'away' ? 'away' : 'home')

export function defaultTitles(id: SceneId, d: PreviewData, o: TitleOpts = {}): Resolved {
  const mk = (kicker: string, headline: string, extra = '', extraLabel: string | null = null): Resolved => ({ kicker, headline, extra, extraLabel })
  switch (id) {
    case 'hook': return mk(d.hook.kicker, (d.series.gameNumber ? `Game ${d.series.gameNumber} tonight.` : 'Tonight.'), d.hookText.caption, 'Line under the number')
    case 'matchup': return mk(`${d.series.label ? d.series.label.toUpperCase() + (d.series.gameNumber ? ` · GAME ${d.series.gameNumber}` : '') : 'TODAY'}`, `${d.teams.away.nickname} at ${d.teams.home.nickname}`, d.series.summary ?? '', 'Series line')
    case 'replay': return mk(`HOW ${d.lastGame.label === 'LAST MEETING' ? 'THE LAST MEETING' : d.lastGame.label} WAS WON`, d.headlines.replay)
    case 'arsenal': return mk(`${d.teams.away.nickname} · ${d.starters.away.name}`, d.headlines.arsenal)
    case 'arsenalHome': return mk(`${d.teams.home.nickname} · ${d.starters.home.name}`, d.headlines.arsenal)
    case 'compare': {
      const a = d.starters.away, h = d.starters.home
      const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)
      return mk('ARSENALS SIDE BY SIDE', `${cap(a.arsenal[0].name.toLowerCase())} for ${a.last}, ${h.arsenal[0].name.toLowerCase()} for ${h.last}.`)
    }
    case 'tunnel': return mk(`${d.teams[d.tunnel.side].nickname} · ${d.starters[d.tunnel.side].name}`, d.headlines.tunnel)
    case 'defense': case 'defenseAway': {
      const s = defenseSide(id, o.defenseMode ?? 'home')
      return mk(`${d.teams[s].nickname} DEFENSE · OUTS ABOVE AVERAGE`, id === 'defense' && s === 'home' ? d.headlines.defense : d.defense[s].headline)
    }
    case 'scout': return (o.scoutTopic ?? 'run') === 'run'
      ? mk('SCOUT REPORT · RUNNING GAME', scoutRunHeadline(d))
      : mk('SCOUT REPORT · LATE AND CLOSE', 'How each club hits when it is tight.')
    case 'bullpen': return (o.bullpenMode ?? 'lastGame') === 'lastGame'
      ? mk(`BULLPENS · ${d.lastGame.label} PITCHES`, d.headlines.bullpen, d.bullpens.lastGame.closing, 'Closing line')
      : mk('BULLPENS · LAST 3 DAYS', 'Who is rested, who is not.')
    case 'outro': return mk('', `${d.starters.away.last} vs ${d.starters.home.last}`, 'Full Scout at x9Lab', 'Button text')
    default: return mk('', '')
  }
}

export function scoutRunHeadline(d: PreviewData): string {
  const run = d.scout?.run ?? []
  const both = run.length === 2 && run[0].pop != null && run[1].pop != null
  const quick = both ? [...run].sort((a, b) => (a.pop as number) - (b.pop as number))[0] : null
  return quick ? `${last(quick.catcher)} gets the ball down quickest.` : 'Two catchers, two arms.'
}

const pick = (o: string | undefined, d: string) => (o && o.trim() !== '' ? o : d)
export function resolveTitles(id: SceneId, d: PreviewData, titles: Titles | undefined, o: TitleOpts = {}): Resolved {
  const def = defaultTitles(id, d, o), ov = titles?.[id]
  return { kicker: pick(ov?.kicker, def.kicker), headline: pick(ov?.headline, def.headline), extra: pick(ov?.extra, def.extra), extraLabel: def.extraLabel }
}
