// src/components/admin/story-v5/preview-data.server-fetch-allowed.ts
//
// buildPreviewData(gamePk, props): ONE typed JSON for every v5 scene. Admin-only, on demand, never in a public render path
// (live pulls from MLB StatsAPI and Baseball Savant, `cache: 'no-store'`). Nothing is written to Supabase; the only write is the
// JSON file next to the rendered MP4 (story-v5-out/{gamePk}/{slateDate}/data.json) so numbers can be checked against the Scout text.
//
// Verified against live responses (2026-10-24, gamePk 849802 / previous game 849805):
//   schedule?gamePk=&hydrate=team,probablePitcher,seriesStatus       -> game, teams, probables, series
//   schedule?sportId=1&teamId=&opponentId=&startDate=&endDate=&gameType=R,F,D,L,W
//   game/{pk}/playByPlay                                             -> allPlays[], scoringPlays[]
//   game/{pk}/boxscore                                               -> teams.*.pitchers[], players['ID<id>']
//   people/{id}  ·  people/{id}/stats?stats=season&group=pitching&season=&gameType=P
//   teams/{id}/roster?rosterType=active
//   Savant statcast_search/csv?type=details&game_pk=  and  &player_type=pitcher&pitchers_lookup[]=&hfSea=&hfGT=R|PO|
//   Savant leaderboard/outs_above_average?type=Fielder&pos=<3..9>&csv=true

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getProjectedLineup } from '@/lib/lineups'
import { loadScoutExtras } from '../story/scoutExtras'
import { buildArsenal, FASTBALLS, timesThrough } from './arsenal'
import { buildBeats, lastName, storyline, type Pbp } from './beats'
import { bullpenLines, last3Arms, lastGameArms, type Box } from './bullpen'
import { parseCsv } from './csv'
import { buildDefense, FIELD_POS, POS_CODE, startersFromBox, type LineupSlot, type OaaRow } from './defense'
import { buildScout } from './scout'
import { headshotUrl, teamInfo } from './teams'
import { pathFor, tunnel, type StatcastPitch } from './trajectory'
import type { BullpenL3Arm, DefenseSide, HookPitch, PreviewData, Side, Starter, TeamInfo } from './types'
import { PreviewDataError, checkImages, checkRoster, isNum } from './validate'

const MLB = 'https://statsapi.mlb.com/api/v1'
const SAVANT = 'https://baseballsavant.mlb.com'
const POST = new Set(['W', 'L', 'D', 'F'])
const OUT_DIR = path.join(process.cwd(), 'story-v5-out')
const CACHE_MS = 10 * 60 * 1000

export type PreviewProps = {
  /** The hook stat text. `value` defaults to the hardest pitch's speed; `caption` is typed by a person (never invented). */
  hook?: { value?: string; unit?: string; caption?: string }
  headlines?: Partial<PreviewData['headlines']>
  refresh?: boolean
  checkImages?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- MLB Stats API JSON, fields read defensively below
type Json = any

async function getJson(url: string, label: string, problems: string[]): Promise<Json | null> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
    if (!res.ok) { problems.push(`${label}: HTTP ${res.status}`); return null }
    return await res.json()
  } catch (e) { problems.push(`${label}: ${(e as Error).message}`); return null }
}
async function getCsv(url: string, label: string, problems: string[]): Promise<Record<string, string>[]> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(90000) })
    if (!res.ok) { problems.push(`${label}: HTTP ${res.status}`); return [] }
    return parseCsv(await res.text())
  } catch (e) { problems.push(`${label}: ${(e as Error).message}`); return [] }
}
async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]) }
  }))
  return out
}

const shift = (date: string, days: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ({ 1: 'ST', 2: 'ND', 3: 'RD' } as Record<number, string>)[n % 10] ?? 'TH'}`
const WORD: Record<number, string> = { 2: 'Two', 3: 'Three', 4: 'Four' }

function clock(iso: string): { londonText: string; etText: string; ptText: string; londonDay: string } {
  const d = new Date(iso)
  const t = (tz: string) => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(d).replace(/\s/g, '')
  const et = t('America/New_York').replace(':00', '')
  return { londonText: t('Europe/London'), etText: et, ptText: t('America/Los_Angeles').replace(':00', ''), londonDay: new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/London', weekday: 'short' }).format(d).toUpperCase() }
}

async function previousGame(awayId: number, homeId: number, thisPk: number, thisIso: string, slateDate: string, problems: string[]): Promise<Json | null> {
  const j = await getJson(`${MLB}/schedule?sportId=1&teamId=${awayId}&opponentId=${homeId}&startDate=${shift(slateDate, -150)}&endDate=${slateDate}&gameType=R,F,D,L,W`, 'previous game schedule', problems)
  const games: Json[] = (j?.dates ?? []).flatMap((d: Json) => d.games).filter((g: Json) => g.gamePk !== thisPk && g.status?.abstractGameState === 'Final' && String(g.gameDate) < thisIso)
  games.sort((a, b) => String(a.gameDate).localeCompare(String(b.gameDate)))
  const prev = games.pop()
  if (!prev) problems.push('previous game: no finished earlier game between these clubs')
  return prev ?? null
}

async function starterFor(side: Side, teamId: number, pid: number | null, name: string | null, confirmed: boolean, season: number, postseason: boolean, problems: string[]): Promise<Starter | null> {
  const label = `${side} starter`
  if (!pid || !name) { problems.push(`${label}: no probable pitcher`); return null }
  const [rows, person, line] = await Promise.all([
    getCsv(`${SAVANT}/statcast_search/csv?all=true&type=details&player_type=pitcher&pitchers_lookup%5B%5D=${pid}&hfSea=${season}%7C&hfGT=R%7CPO%7C`, `${label} Savant pitches`, problems),
    getJson(`${MLB}/people/${pid}`, `${label} person`, problems),
    getJson(`${MLB}/people/${pid}/stats?stats=season&group=pitching&season=${season}&gameType=${postseason ? 'P' : 'R'}`, `${label} season line`, problems),
  ])
  const arsenal = buildArsenal(rows, 4)
  if (!arsenal.length) problems.push(`${label} ${name}: no pitch type with 20 or more pitches and a usable trajectory`)
  const tto = timesThrough(rows)
  if (!tto) problems.push(`${label} ${name}: fewer than 20 plate appearances in the first or second time through the order`)
  const st = line?.stats?.[0]?.splits?.[0]?.stat
  if (!st) problems.push(`${label} ${name}: no ${postseason ? 'postseason' : 'season'} pitching line`)
  if (!arsenal.length || !tto || !st) return null
  const bf = Number(st.battersFaced), bb = Number(st.baseOnBalls)
  if (!isNum(bf) || !(bf > 0) || !isNum(bb) || !isNum(Number(st.strikeOuts)) || !isNum(Number(st.earnedRuns))) { problems.push(`${label} ${name}: season line is missing a number`); return null }
  return {
    id: pid, name, last: lastName(name), confirmed, hand: person?.people?.[0]?.pitchHand?.code ?? null, teamId, headshot: headshotUrl(pid), arsenal,
    line: { ip: String(st.inningsPitched), er: Number(st.earnedRuns), k: Number(st.strikeOuts), bb, bf, bbRatePct: Math.round((bb / bf) * 1000) / 10, label: postseason ? 'POSTSEASON' : 'SEASON' },
    tto,
  }
}

export async function buildPreviewData(gamePk: number, props: PreviewProps = {}): Promise<PreviewData> {
  const problems: string[] = []
  const sched = await getJson(`${MLB}/schedule?gamePk=${gamePk}&hydrate=team,probablePitcher,seriesStatus`, 'schedule', problems)
  const g = sched?.dates?.[0]?.games?.[0]
  if (!g) throw new PreviewDataError([...problems, `gamePk ${gamePk}: not found in the schedule`])
  const slateDate: string = g.officialDate ?? String(g.gameDate).slice(0, 10)
  const cachePath = path.join(OUT_DIR, String(gamePk), slateDate, 'data.json')
  if (!props.refresh) {
    // Saved data is reused for 10 minutes only: starters and lineups are confirmed through the afternoon, so an older copy can be out of date.
    try { const c = JSON.parse(await fs.readFile(cachePath, 'utf8')) as PreviewData; if (Date.now() - Date.parse(c.generatedAt) < CACHE_MS) return c } catch { /* no cache yet */ }
  }

  const mk = (s: Side): TeamInfo | null => { const t = g.teams[s].team; const i = teamInfo(Number(t.id), t.abbreviation, t.name, t.teamName); if (!i) problems.push(`team ${t.id} (${t.name}) is not in the team colour table`); return i }
  const away = mk('away'), home = mk('home')
  if (!away || !home) throw new PreviewDataError(problems)
  const postseason = POST.has(g.gameType)
  const season = Number(slateDate.slice(0, 4))

  // Series label and score
  const gameNumber: number | null = isNum(g.seriesGameNumber) ? g.seriesGameNumber : null
  const footer = postseason && gameNumber ? `${String(g.seriesDescription).toUpperCase()} G${gameNumber} · ${away.abbr} @ ${home.abbr}` : `${away.abbr} @ ${home.abbr} · ${slateDate}`
  const series = { label: String(g.seriesDescription ?? ''), gameNumber, summary: g.seriesStatus?.result ?? null, footer }

  // Previous game
  const prev = await previousGame(away.id, home.id, gamePk, g.gameDate, slateDate, problems)
  if (!prev) throw new PreviewDataError(problems)
  const prevPk: number = prev.gamePk
  const [pbp, box, hookRows, rosterA, rosterH] = await Promise.all([
    getJson(`${MLB}/game/${prevPk}/playByPlay`, 'previous game play by play', problems) as Promise<Pbp | null>,
    getJson(`${MLB}/game/${prevPk}/boxscore`, 'previous game box score', problems) as Promise<Box | null>,
    getCsv(`${SAVANT}/statcast_search/csv?all=true&type=details&game_pk=${prevPk}`, 'previous game Savant pitches', problems),
    getJson(`${MLB}/teams/${away.id}/roster?rosterType=active&date=${slateDate}`, 'away roster', problems),
    getJson(`${MLB}/teams/${home.id}/roster?rosterType=active&date=${slateDate}`, 'home roster', problems),
  ])
  const roster = { away: new Set<number>((rosterA?.roster ?? []).map((r: Json) => r.person.id)), home: new Set<number>((rosterH?.roster ?? []).map((r: Json) => r.person.id)) }
  if (!pbp || !box) throw new PreviewDataError(problems)
  // In a previous meeting the home and away clubs can be the other way round (WS Game 3 is at the other park): everything below is keyed by club.
  const swap = box.teams.away.team.id !== away.id
  const prevGameLabel = postseason && prev.seriesGameNumber && prev.seriesDescription === g.seriesDescription ? `GAME ${prev.seriesGameNumber}` : 'LAST MEETING'
  const nameOf = (id: number): string | null => box.teams.away.players[`ID${id}`]?.person.fullName ?? box.teams.home.players[`ID${id}`]?.person.fullName ?? null

  // Hook: hardest pitch of the previous game (pitcher id, never the batter column)
  let hook: HookPitch | null = null
  const fast = hookRows.filter(r => Number.isFinite(Number(r.release_speed)) && r.pitcher).sort((a, b) => Number(b.release_speed) - Number(a.release_speed))
  for (const r of fast) {
    const p = pathFor({ release_pos_x: +r.release_pos_x, release_pos_y: +r.release_pos_y, release_pos_z: +r.release_pos_z, vx0: +r.vx0, vy0: +r.vy0, vz0: +r.vz0, ax: +r.ax, ay: +r.ay, az: +r.az } as StatcastPitch)
    if (!p) continue
    const pid = Number(r.pitcher), name = nameOf(pid)
    const inA = box.teams.away.pitchers.includes(pid)
    if (!name) { problems.push(`hook pitch: pitcher ${pid} is not in the box score`); break }
    const half: 'top' | 'bot' = r.inning_topbot === 'Top' ? 'top' : 'bot', inning = Number(r.inning)
    hook = {
      speed: Number(r.release_speed), code: r.pitch_type, pitcherId: pid, pitcherName: name, pitcherLast: lastName(name), teamId: inA ? box.teams.away.team.id : box.teams.home.team.id,
      headshot: headshotUrl(pid), inning, half, gameLabel: prevGameLabel, kicker: `${prevGameLabel} · ${half === 'top' ? 'TOP' : 'BOT'} ${ordinal(inning)} · ${lastName(name).toUpperCase()}`,
      path: { points: p.points, tPlate: p.tPlate },
    }
    break
  }
  if (!hook) problems.push('hook pitch: no pitch with a usable trajectory in the previous game')

  // Beats and storyline
  const { beats } = buildBeats(pbp, nameOf, undefined, swap)
  const story = storyline(beats)
  if (!beats.length || !story) problems.push('previous game: no key plays found')

  // Starters: the box score lists the starting pitcher once the lineup card is in (confirmed). Until then it is the schedule's probable pitcher.
  const curBox = await getJson(`${MLB}/game/${gamePk}/boxscore`, 'this game box score', []) as Box | null
  const boxStarter = (s: Side): { id: number; name: string } | null => {
    const id = curBox?.teams?.[s]?.pitchers?.[0]
    const nm = id != null ? curBox?.teams?.[s]?.players?.[`ID${id}`]?.person?.fullName : null
    return id != null && nm ? { id, name: nm } : null
  }
  const [sA, sH] = await Promise.all((['away', 'home'] as const).map(s => { const b = boxStarter(s); return starterFor(s, g.teams[s].team.id, b?.id ?? g.teams[s].probablePitcher?.id ?? null, b?.name ?? g.teams[s].probablePitcher?.fullName ?? null, !!b, season, postseason, problems) }))
  const starters = sA && sH ? { away: sA, home: sH } : null

  // Tunnel: the home starter's top fastball and top non-fastball
  let tun: PreviewData['tunnel'] | null = null
  if (starters) {
    const ar = starters.home.arsenal
    const a = ar.find(p => FASTBALLS.includes(p.code)), b = ar.find(p => !FASTBALLS.includes(p.code))
    if (!a || !b) problems.push(`${starters.home.name}: needs a fastball and an offspeed pitch with 20 or more pitches for the tunnel scene`)
    else {
      const t = tunnel({ ...a.path, plate: a.path.points[a.path.points.length - 1], release: a.path.points[0] }, { ...b.path, plate: b.path.points[b.path.points.length - 1], release: b.path.points[0] })
      tun = { side: 'home', data: { a, b, withinInchFt: t.withinInchFt == null ? null : Math.round(t.withinInchFt), apartInches: Math.round(t.apartInches), pointY: 30 } }
    }
  }

  // Defense
  const lineups = await Promise.all([away, home].map(t => getProjectedLineup(t.id, slateDate, gamePk).catch(() => null)))
  const oaa: OaaRow[] = (await Promise.all(FIELD_POS.map(async pos => {
    const rows = await getCsv(`${SAVANT}/leaderboard/outs_above_average?type=Fielder&startYear=${season}&endYear=${season}&split=no&team=&range=year&min=1&pos=${POS_CODE[pos]}&roles=&viz=hide&csv=true`, `OAA leaderboard ${pos}`, problems)
    return rows.map(r => ({ id: Number(r.player_id), name: r['last_name, first_name'], team: r.display_team_name, pos, oaa: Number(r.outs_above_average) })).filter(r => Number.isFinite(r.id) && Number.isFinite(r.oaa))
  }))).flat()
  const alignment = async (i: number): Promise<{ slots: LineupSlot[]; confirmed: boolean } | null> => {
    const lu = lineups[i], t = i === 0 ? away : home
    const cur = curBox?.teams?.[i === 0 ? 'away' : 'home']
    if (cur) { const slots = startersFromBox(cur.players as never); if (slots.length === 9) return { slots, confirmed: true } }   // the lineup card for this game is in
    if (!lu || lu.source === 'unavailable') { problems.push(`${t.nickname} defense: no lineup`); return null }
    // Starters and their starting positions from the box score of the game the lineup came from (a finished game's own lineup lists PH / PR
    // in the slots that were replaced). Confirmed: this game. Projected: the club's last finished game.
    const pk = lu.game_pk_used
    const bx = pk ? await getJson(`${MLB}/game/${pk}/boxscore`, `${t.abbr} last lineup box score`, problems) : null
    const side = bx?.teams?.away?.team?.id === t.id ? bx.teams.away : bx?.teams?.home
    if (!side) { problems.push(`${t.nickname} defense: last lineup box score unreadable`); return null }
    return { slots: startersFromBox(side.players), confirmed: lu.source === 'confirmed' }
  }
  const def = (s: Side, t: TeamInfo, a: { slots: LineupSlot[]; confirmed: boolean } | null): DefenseSide | null => {
    if (!a) return null
    const r = buildDefense(s, t.id, t.nickname, a.slots, oaa, a.confirmed)
    problems.push(...r.problems)
    return r.data
  }
  const [alA, alH] = await Promise.all([alignment(0), alignment(1)])
  const dA = def('away', away, alA), dH = def('home', home, alH)

  // Bullpens: previous game + last 3 days (window of 10 days of finished games from the schedule)
  const lastArms = { away: lastGameArms(box, swap ? 'home' : 'away'), home: lastGameArms(box, swap ? 'away' : 'home') }
  const win = await Promise.all([away, home].map(async t => {
    const j = await getJson(`${MLB}/schedule?sportId=1&teamId=${t.id}&startDate=${shift(slateDate, -10)}&endDate=${shift(slateDate, -1)}&gameType=R,F,D,L,W`, `${t.abbr} recent schedule`, problems)
    const gs = ((j?.dates ?? []) as Json[]).flatMap(d => d.games.filter((x: Json) => x.status?.abstractGameState === 'Final').map((x: Json) => ({ pk: x.gamePk as number, date: d.date as string })))
    return mapLimit(gs, 6, async x => { const b = await getJson(`${MLB}/game/${x.pk}/boxscore`, `box score ${x.pk}`, problems) as Box | null; return b ? { date: x.date, box: b } : null })
  }))
  const l3: Record<Side, BullpenL3Arm[]> = {
    away: last3Arms(win[0].filter((x): x is NonNullable<typeof x> => !!x), away.id, slateDate, roster.away).slice(0, 8),
    home: last3Arms(win[1].filter((x): x is NonNullable<typeof x> => !!x), home.id, slateDate, roster.home).slice(0, 8),
  }

  // Other Scout Report desks for the optional Scout Report slide. A failing desk leaves that slide unavailable; it never blocks the video.
  const scout = await loadScoutExtras({
    gamePk, gameDate: slateDate, awayTeamId: away.id, homeTeamId: home.id, awayAbbr: away.abbr, homeAbbr: home.abbr,
    awayPitcherId: g.teams.away.probablePitcher?.id ?? null, homePitcherId: g.teams.home.probablePitcher?.id ?? null,
  }).then(x => buildScout(x as never, { away: away.id, home: home.id })).catch(e => { console.error('[buildPreviewData] scout desks failed:', (e as Error).message); return buildScout(null, { away: away.id, home: home.id }) })

  // Roster check: everyone shown with a headshot except the historical beat players
  if (starters) { checkRoster(`${away.abbr} starter`, [{ id: starters.away.id, name: starters.away.name }], roster.away, problems); checkRoster(`${home.abbr} starter`, [{ id: starters.home.id, name: starters.home.name }], roster.home, problems) }
  if (hook) checkRoster('hook pitcher', [{ id: hook.pitcherId, name: hook.pitcherName }], hook.teamId === away.id ? roster.away : roster.home, problems)
  for (const [d, t, r] of [[dA, away, roster.away], [dH, home, roster.home]] as const) if (d) checkRoster(`${t.abbr} defense`, d.fielders.map(f => ({ id: f.id, name: f.name })), r, problems)
  checkRoster(`${away.abbr} previous game bullpen`, lastArms.away, roster.away, problems)
  checkRoster(`${home.abbr} previous game bullpen`, lastArms.home, roster.home, problems)
  if (!lastArms.away.length && !lastArms.home.length) problems.push('previous game: no relievers in the box score')

  // Images
  if (props.checkImages !== false) {
    const urls = [away.logo, home.logo, ...(hook ? [hook.headshot] : []), ...(starters ? [starters.away.headshot, starters.home.headshot] : []),
      ...[dA, dH].flatMap(d => d?.fielders.map(f => f.headshot) ?? []), ...[...lastArms.away, ...lastArms.home].map(a => a.headshot), ...beats.flatMap(b => (b.batterHeadshot ? [b.batterHeadshot] : [])), ...scout.run.map(r => r.headshot)]
    await checkImages(urls, problems)
  }

  if (problems.length || !hook || !story || !starters || !tun || !dA || !dH) throw new PreviewDataError(problems.length ? problems : ['unknown: a scene input is missing'])

  const lines = bullpenLines(lastArms.away, lastArms.home)
  const arN = starters.away.arsenal.length
  const data: PreviewData = {
    gamePk, slateDate, generatedAt: new Date().toISOString(), venue: g.venue?.name ?? null, teams: { away, home }, series,
    firstPitch: { ...clock(g.gameDate), iso: g.gameDate },
    lastGame: { gamePk: prevPk, label: prevGameLabel, awayScore: Number(prev.teams[swap ? 'home' : 'away'].score), homeScore: Number(prev.teams[swap ? 'away' : 'home'].score), winner: Number(prev.teams[swap ? 'home' : 'away'].score) > Number(prev.teams[swap ? 'away' : 'home'].score) ? 'away' : 'home' },
    hook, hookText: { value: props.hook?.value ?? hook.speed.toFixed(1), unit: props.hook?.unit ?? 'MPH', caption: props.hook?.caption ?? '' },
    scout, beats, storyline: story, starters, tunnel: tun, defense: { away: dA, home: dH },
    bullpens: { lastGame: { away: lastArms.away, home: lastArms.home, ...lines }, last3: l3 },
    headlines: {
      replay: props.headlines?.replay ?? story.headline,
      arsenal: props.headlines?.arsenal ?? `${WORD[arN] ?? arN} looks, one finisher.`,
      tunnel: props.headlines?.tunnel ?? 'Same tunnel. Different pitch.',
      defense: props.headlines?.defense ?? dH.headline,
      bullpen: props.headlines?.bullpen ?? lines.headline,
    },
  }
  await fs.mkdir(path.dirname(cachePath), { recursive: true })
  await fs.writeFile(cachePath, JSON.stringify(data, null, 2))
  return data
}
