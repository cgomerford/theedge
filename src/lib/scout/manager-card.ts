// src/lib/scout/manager-card.ts
//
// Scout §12 (Manager card) — up to eight plain-language watch-fors per club, each
// assembled from numbers already shown in the sections above and carrying the
// sample behind it. Every item is a description, never an instruction: it says
// what the data shows and points at the section it came from.
//
// For club X (the club the card is written for) facing club Y:
//   zone fits vs Y's starter (+ how he fades third time through), the run game vs
//   Y's catcher and starter, X's ABS profile, Y's bullpen in the 7th–8th, how Y's
//   infield shades against X's pull hitters, X's platoon splits vs the starter's
//   hand, the weakest glove in Y's lineup, who is available for X, and the park.
// An item is omitted when its underlying sample is too thin to say anything.
//
// Each item is a row on a game sheet: `when` names the situation it applies to ("Facing
// Jobe (RHP)", "A runner reaches first"), `body` says what the numbers show there.

import { getLineupVsSp, MIN_CLASH_PITCHES } from './lineup-vs-sp'
import { getRunGame, MIN_ATTEMPTS } from './run-game'
import { getAbsDesk, MIN_ABS_N } from './abs-desk'
import { getBullpenDesk } from './bullpen-desk'
import { getDefenseDesk, MIN_ALIGN_PITCHES } from './defense'
import { getClubSplits, MIN_SPLIT_PA } from './splits'
import { getParkDeep } from './park-deep'
import { getClubStatus } from './club-status'
import { getLateInnings } from './late-innings'
import { getPitcherStatsFull } from '@/lib/pitcher-full-stats'
import type { ScoutClub, ScoutContext } from '@/components/scout/types'

export type WatchFor = { id: string; tag: string; /** the situation this row is for */ when: string; title: string; body: string; section: string; sectionLabel: string }
export type ManagerCards = { away: WatchFor[]; home: WatchFor[] }

export const MAX_WATCH_FORS = 10
const surname = (n: string) => n.trim().split(/\s+/).slice(-1)[0]
// flag reasons can carry their own parentheses — fold them in so a watch-for never nests them
const plain = (t: string) => t.replace(/\s*\(([^)]*)\)/g, ', $1')
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
const ord = (n: number) => { const v = n % 100; return v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th' }
const f3 = (v: number) => v.toFixed(3).replace(/^0/, '')

async function cardFor(ctx: ScoutContext, me: ScoutClub, opp: ScoutClub): Promise<WatchFor[]> {
  const { gameDate, gamePk } = ctx
  const oppSpId = opp.probableId, oppSpName = opp.probableName
  const [lvs, run, abs, oppPen, oppDef, mySplits, park, myStatus, tto, myLate, oppLate] = await Promise.all([
    oppSpId ? getLineupVsSp(me.id, oppSpId, oppSpName ?? 'the starter', gameDate, gamePk).catch(() => null) : Promise.resolve(null),
    getRunGame(me.id, opp.id, gameDate, gamePk, oppSpId).catch(() => null),
    getAbsDesk(me.id, me.abbr, gameDate).catch(() => null),
    getBullpenDesk(opp.id, gameDate).catch(() => null),
    getDefenseDesk(opp.id, opp.abbr, me.id, gameDate, gamePk, oppSpId).catch(() => null),
    getClubSplits(me.id, gameDate, gamePk, me.probableId).catch(() => null),
    getParkDeep(ctx.venueId, ctx.venueName).catch(() => null),
    getClubStatus(me.id, gameDate, gamePk, me.probableId).catch(() => null),
    oppSpId ? getPitcherStatsFull(oppSpId).catch(() => null) : Promise.resolve(null),
    getLateInnings(me.id, opp.id, gameDate).catch(() => null),
    getLateInnings(opp.id, me.id, gameDate).catch(() => null),
  ])
  const out: WatchFor[] = []

  // 1 — zone fits vs the opposing starter (+ how he fades)
  if (lvs) {
    const ranked = lvs.hitters.filter((h) => h.clash && h.clash.pitches >= MIN_CLASH_PITCHES).sort((a, b) => b.clash!.total - a.clash!.total)
    const top = ranked.filter((h) => h.clash!.total >= 0.6).slice(0, 3)
    let fade = ''
    if (tto && tto.tto1_woba != null && tto.tto3_woba != null && (tto.tto3_pa ?? 0) >= 40 && tto.tto3_woba - tto.tto1_woba >= 0.03) {
      fade = ` Hitters have a ${f3(tto.tto3_woba)} wOBA against him the third time through the order versus ${f3(tto.tto1_woba)} the first (${tto.tto3_pa} PA on the third pass).`
    }
    if (top.length > 0 || fade) {
      out.push({
        id: 'zone-fit', tag: 'The starter', when: `Facing ${oppSpName ?? 'the starter'}${lvs.sp.hand ? ` (${lvs.sp.hand}HP)` : ''}`, title: `Zone fits vs ${oppSpName ?? 'the starter'}`, section: 'lineup-vs-sp', sectionLabel: '§10',
        body: `${top.length ? `${list(top.map((h) => `${surname(h.name)} (${h.clash!.total >= 0 ? '+' : ''}${h.clash!.total.toFixed(1)})`))} have the largest zone edges against ${oppSpName ?? 'him'} (${lvs.sp.hand ?? '?'}HP), each on 1,000+ pitches of that split.` : ''}${fade}`.trim(),
      })
    }
  }

  // 2 — the run game vs the opposing battery
  if (run && (run.catcher || run.pitcher)) {
    const c = run.catcher, p = run.pitcher
    const parts: string[] = []
    if (c) {
      const att = c.sb + c.cs, csPct = att > 0 ? (c.cs / att) * 100 : null
      const pop = c.strips.find((s) => s.label.startsWith('Pop'))
      parts.push(`${opp.abbr} catcher ${surname(c.name)}${pop && pop.value != null ? ` pops in ${pop.value.toFixed(2)}s (${pop.rank}${ord(pop.rank ?? 0)} of ${pop.of})` : ''}${csPct != null ? ` and has thrown out ${csPct.toFixed(0)}% of ${att} attempts (league ${run.leagueCatcherCsPct?.toFixed(0) ?? '—'}%)` : ''}.`)
    }
    if (p && p.sb + p.cs >= MIN_ATTEMPTS) parts.push(`${surname(p.name)} has allowed ${p.sb} steals against ${p.cs} caught stealing.`)
    const runners = run.offense.runners.filter((r) => r.sb + r.cs >= MIN_ATTEMPTS).slice(0, 2)
    if (runners.length) parts.push(`${me.abbr}'s most active runners: ${runners.map((r) => `${surname(r.name)} ${r.sb}/${r.sb + r.cs}${r.sprint ? ` (${r.sprint.toFixed(1)} ft/s)` : ''}`).join(', ')}.`)
    if (parts.length) out.push({ id: 'run-game', tag: 'Run game', when: `A ${me.abbr} runner reaches first`, title: `Running on ${c ? surname(c.name) : opp.abbr}`, body: parts.join(' '), section: 'run-game', sectionLabel: '§5' })
  }

  // 3 — the club's own ABS profile
  if (abs && abs.season.all.n >= 30) {
    const s = abs.season, rate = s.games > 0 ? s.all.n / s.games : 0
    const top = abs.challengers.find((x) => x.side === 'fielding' && x.n >= MIN_ABS_N)
    out.push({
      id: 'abs', tag: 'ABS challenges', when: 'A ball–strike call is close', title: `${me.abbr}'s challenge profile`, section: 'abs', sectionLabel: '§4',
      body: `${abs.profile.label.split(' — ')[0]}: ${rate.toFixed(2)} a game (${abs.rank.rate}${ord(abs.rank.rate)} of ${abs.rank.of}), ${s.all.n > 0 ? Math.round((s.all.ov / s.all.n) * 100) : 0}% overturned (n=${s.all.n}). Batters start ${Math.round((s.batter.n / Math.max(1, s.all.n)) * 100)}% of them${top ? `; ${surname(top.name)} has won ${top.ov} of ${top.n} behind the plate` : ''}.`,
    })
  }

  // 4 — the opposing bullpen in the 7th–8th
  if (oppPen && oppPen.arms.length > 0) {
    const taxed = oppPen.arms.filter((a) => a.flag === 'overworked'), shaky = oppPen.arms.filter((a) => a.flag === 'shaky'), sharp = oppPen.arms.filter((a) => a.flag === 'sharp')
    const bits: string[] = []
    if (taxed.length) bits.push(`${list(taxed.map((a) => `${surname(a.name)} (${plain(a.flagReason).toLowerCase()})`))} ${taxed.length > 1 ? 'are' : 'is'} carrying recent work`)
    if (shaky.length) bits.push(`${list(shaky.map((a) => `${surname(a.name)} (${plain(a.flagReason)})`))} ${shaky.length > 1 ? 'have' : 'has'} struggled over the last week`)
    if (sharp.length) bits.push(`${list(sharp.map((a) => surname(a.name)))} ${sharp.length > 1 ? 'are' : 'is'} throwing well`)
    out.push({ id: 'pen', tag: '7th–8th', when: `The ${opp.abbr} bullpen takes over`, title: `${opp.abbr} bullpen in the late innings`, section: 'bullpen', sectionLabel: '§3', body: bits.length ? `${bits.join('; ')}.` : `No ${opp.abbr} reliever is flagged for heavy recent work or a rough week.` })
  }

  // 4b — the late innings: this season against this opponent, and who the opponent uses in the 8th / 9th
  if (myLate || oppLate) {
    const parts: string[] = []
    const v = myLate?.vsOpp
    if (v && v.games > 0) {
      const scored = v.scored.reduce((a, b) => a + b, 0), allowed = v.allowed.reduce((a, b) => a + b, 0)
      const rel = myLate!.relation === 'division' ? 'division rival' : myLate!.relation === 'league' ? 'same league' : 'opposite league'
      parts.push(`${me.abbr} has scored ${scored} and allowed ${allowed} runs from the 7th on across ${v.games} meeting${v.games === 1 ? '' : 's'} with ${opp.abbr} this season (${rel}${v.games < 5 ? ' — a small sample' : ''}).`)
    }
    const arms = oppLate?.arms, g = oppLate?.season.games ?? 0
    if (arms && g > 0) {
      const top = (i: number) => [...arms].sort((a, b) => b.inn[i] - a.inn[i])[0]
      const e = top(1), n = top(2)
      if (e && e.inn[1] >= 5 && n && n.inn[2] >= 5) parts.push(`${opp.abbr} has used ${surname(e.name)} in the 8th in ${e.inn[1]} of ${g} games and ${surname(n.name)} in the 9th in ${n.inn[2]}.`)
    }
    if (parts.length) out.push({ id: 'late', tag: 'Late innings', when: `Late and close against ${opp.abbr}`, title: `The 7th inning on vs ${opp.abbr}`, section: 'leverage', sectionLabel: '§11', body: parts.join(' ') })
  }

  // 5 — the opposing infield shade vs the club's pull hitters
  if (oppDef) {
    const rows = oppDef.matchup.filter((h) => h.pullPct != null && h.pullPct >= 30 && h.vsSide.n >= MIN_ALIGN_PITCHES && h.vsSide.ifShade / h.vsSide.n >= 0.2)
    if (rows.length) {
      const side = rows[0].stand === 'L' ? 'left-handed' : 'right-handed'
      out.push({
        id: 'shade', tag: 'Alignment', when: `${me.abbr} pull hitters bat against the ${opp.abbr} infield`, title: `${opp.abbr} infield shade`, section: 'defense', sectionLabel: '§6',
        body: `${opp.abbr} shades the infield on ${Math.round((rows[0].vsSide.ifShade / rows[0].vsSide.n) * 100)}% of pitches to ${side} hitters. ${list(rows.slice(0, 3).map((h) => `${surname(h.name)} (${h.pullPct}% pull)`))} are the hitters most likely to see it.`,
      })
    }
  }

  // 6 — platoon splits vs the starter's hand
  if (mySplits && lvs?.sp.hand) {
    const k = lvs.sp.hand === 'L' ? 'vl' : 'vr', other = lvs.sp.hand === 'L' ? 'vr' : 'vl'
    const a = mySplits.lineupOps[k], b = mySplits.lineupOps[other]
    const swings = mySplits.lineup.map((h) => ({ h, a: h.splits[k], b: h.splits[other] })).filter((x) => x.a && x.b && x.a.ops != null && x.b.ops != null && x.a.pa >= MIN_SPLIT_PA && x.b.pa >= MIN_SPLIT_PA)
      .map((x) => ({ name: x.h.name, d: (x.a!.ops as number) - (x.b!.ops as number), pa: x.a!.pa })).sort((p, q) => Math.abs(q.d) - Math.abs(p.d)).slice(0, 2)
    if (a && b) out.push({
      id: 'platoon', tag: 'Platoon', when: `A ${lvs.sp.hand === 'L' ? 'left' : 'right'}-hander is on the mound`, title: `Lineup vs ${lvs.sp.hand === 'L' ? 'left' : 'right'}-handers`, section: 'splits', sectionLabel: '§7',
      body: `The lineup carries a ${f3(a.ops)} OPS against ${lvs.sp.hand === 'L' ? 'lefties' : 'righties'} (${a.pa} PA) and ${f3(b.ops)} against the other side.${swings.length ? ` Biggest gaps: ${swings.map((s) => `${surname(s.name)} ${s.d >= 0 ? '+' : '−'}${Math.abs(s.d).toFixed(3).replace(/^0/, '')} vs ${lvs.sp.hand === 'L' ? 'LHP' : 'RHP'} (${s.pa} PA)`).join(', ')}.` : ''}`,
    })
  }

  // 7 — the weakest glove in the opposing lineup
  if (oppDef) {
    const weak = oppDef.fielders.filter((f) => f.oaa != null && f.oaa <= -4).sort((a, b) => (a.oaa as number) - (b.oaa as number))[0]
    if (weak) out.push({ id: 'glove', tag: `${opp.abbr} defense`, when: `A ball goes toward ${opp.abbr}'s ${weak.pos}`, title: 'Weakest glove in the lineup', section: 'defense', sectionLabel: '§6', body: `${opp.abbr}'s ${weak.pos} ${weak.name} rates ${weak.oaa} Outs Above Average this season; the club as a whole is ${oppDef.team.oaa != null ? `${oppDef.team.oaa > 0 ? '+' : ''}${oppDef.team.oaa} (${oppDef.team.rank}${ord(oppDef.team.rank ?? 0)} of ${oppDef.team.of})` : 'unranked'}.` })
  }

  // 8 — availability on the club's own side
  if (myStatus) {
    const out_ = myStatus.players.filter((p) => p.status === 'out' && p.group === 'hitter'), q = myStatus.players.filter((p) => p.status === 'questionable')
    if (out_.length || q.length) out.push({
      id: 'availability', tag: 'Availability', when: 'Building the lineup and bench', title: `Who's not fully available`, section: 'club-status', sectionLabel: '§1',
      body: `${out_.length ? `${out_.length} position player${out_.length > 1 ? 's are' : ' is'} out (${list(out_.slice(0, 3).map((p) => surname(p.name)))}${out_.length > 3 ? ' and others' : ''}).` : ''} ${q.length ? `Questionable: ${list(q.slice(0, 4).map((p) => `${surname(p.name)} (${(p.reason ?? '').split(' — ')[0].toLowerCase()})`))}.` : ''}`.trim(),
    })
  }

  // 9 — the park and session
  if (park) {
    const all = park.bySession.All, sess = ctx.dayNight === 'day' ? park.bySession.Day : ctx.dayNight === 'night' ? park.bySession.Night : null
    if (all) out.push({
      id: 'park', tag: 'Park', when: `Playing at ${park.venueName}`, title: `${park.venueName}${sess ? `, ${ctx.dayNight} game` : ''}`, section: 'park', sectionLabel: '§8',
      body: `Statcast park factors (100 = average): runs ${all.runs}, home runs ${all.hr}, wOBA ${all.woba}${sess ? `; the ${ctx.dayNight} session runs ${sess.runs} for runs and ${sess.hr} for home runs` : ''}.`,
    })
  }
  return out.slice(0, MAX_WATCH_FORS)
}

export async function getManagerCards(ctx: ScoutContext): Promise<ManagerCards> {
  const [away, home] = await Promise.all([cardFor(ctx, ctx.away, ctx.home), cardFor(ctx, ctx.home, ctx.away)])
  return { away, home }
}
