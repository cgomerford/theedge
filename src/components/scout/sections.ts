// src/components/scout/sections.ts
//
// The Scout Report's section registry — scroll order, tier, and the scope
// each section is built to. The report is being rebuilt one section at a
// time (the old tab is in components/archive/), so `status` is the honest
// record of what's live: ScoutReport renders a quiet placeholder for
// anything still 'planned'. Flip a section to 'live' when its component
// lands in ScoutReport's SECTION_BODIES map.
//
// Tiers (per George):
//   free   — Free Scout: sections 1–3 in full.
//   teaser — section 12: free users see the first FREE_WATCH_FORS
//            watch-fors, the rest blurred.
//   pro    — everything else.

export type ScoutTier = 'free' | 'teaser' | 'pro'
export type ScoutStatus = 'live' | 'planned'

export type ScoutSectionMeta = {
  id: string
  num: number
  title: string
  tier: ScoutTier
  status: ScoutStatus
  scope: string[]
}

export const FREE_WATCH_FORS = 3

export const SCOUT_SECTIONS: ScoutSectionMeta[] = [
  {
    id: 'club-status', num: 1, title: 'Club status desk', tier: 'free', status: 'live',
    scope: [
      'Injuries / IL / likely scratches, both clubs',
      'Transactions in the last 7 days that affect tonight',
      'Rest days by position player and pitcher',
      'Chart: availability grid (Available / Questionable / Out)',
    ],
  },
  {
    id: 'form-vs-skill', num: 2, title: 'Form vs skill trends', tier: 'free', status: 'live',
    scope: [
      'L7 / L15 / L30 rolling xwOBA or OPS vs season baseline, both clubs',
      'Barrel% / Hard-Hit% / K%–BB% trend sparklines',
      'A "hot or noise" call with the sample n — trend lines, not the Preview snapshot table',
    ],
  },
  {
    id: 'bullpen', num: 3, title: 'Bullpen intelligence', tier: 'free', status: 'live',
    scope: [
      'Chart: pitches / IP per arm, last 3 and last 7 days',
      'Role map: high-leverage / bridge / closer usage pattern',
      'Sharp vs overworked flags (L7 run value or ERA, with n)',
      "Left-handed arms vs tonight's bench bats",
      'Empty states when there has been no recent work',
    ],
  },
  {
    id: 'abs', num: 4, title: 'ABS challenge desk', tier: 'pro', status: 'live',
    scope: [
      'Chart: team challenge rate + overturn rate (season and L15)',
      'Catcher vs batter initiation split, if available',
      'Leverage / late-game tendency when public',
      'Plain watch-for: conserve vs aggressive profile (information, not advice)',
      'Source: Savant ABS boards',
    ],
  },
  {
    id: 'run-game', num: 5, title: 'Run game vs catcher / pitcher', tier: 'pro', status: 'live',
    scope: [
      'Chart: catcher pop time / exchange / arm vs league',
      'SB attempt rate and success vs this catcher, with attempt n',
      'Pitcher hold / time-to-home only if sourced — otherwise omitted',
      'No invented tiny-sample "odds"',
    ],
  },
  {
    id: 'defense', num: 6, title: 'Defense & alignment', tier: 'pro', status: 'live',
    scope: [
      'Chart: IF/OF alignment mix (Standard / Strategic / Shade) — not the banned full shift',
      "Where they shade vs tonight's pull hitters: matchup table + simple field diagram",
      'OAA / positioning leaders on the field tonight',
    ],
  },
  {
    id: 'splits', num: 7, title: 'Platoon · home/road · day/night', tier: 'pro', status: 'live',
    scope: [
      'Full splits for both lineups and both SPs: tables + bar charts',
      "Day/night: BR/ESPN player splits + Savant Park Factors for this venue's session",
      'Scout owns the full cut; Preview only sprinkles day/night into Key Player chips',
    ],
  },
  {
    id: 'park', num: 8, title: 'Park factors deep', tier: 'pro', status: 'live',
    scope: [
      'Chart: runs / HR / wOBA factors',
      'Day vs night / roof for this park',
      "Deeper than Preview's weather line",
    ],
  },
  {
    id: 'pitcher-attack', num: 9, title: 'Pitcher attack deep', tier: 'pro', status: 'live',
    scope: [
      'Count × pitch matrix (full, not one top pitch)',
      'Count Spot map: location in the selected count',
      "What's Next transition strip",
      'vs LHH / RHH location or mix split charts',
      'Link out to Pitching Lab for movement/stuff — Scout shows the decision charts',
    ],
  },
  {
    id: 'lineup-vs-sp', num: 10, title: 'Lineup vs SP deep', tier: 'pro', status: 'live',
    scope: [
      'Zone Clash cards for the full lineup (or top 6 + PH threats)',
      "Chase / whiff / swing% by pitch family vs tonight's arsenal (grouped bars)",
      'Spray / GB-LD-FB lean vs SP hand',
      'Min-n gate on every cell',
      'Link out to Clash / Batting Lab',
    ],
  },
  {
    id: 'leverage', num: 11, title: 'Leverage & late tendencies', tier: 'pro', status: 'live',
    scope: [
      'Chart: how this bullpen enters with the tying / go-ahead run on',
      'Offense late & close / RISP with honest n',
      'Challenge / SB aggression in high leverage when derivable',
    ],
  },
  {
    id: 'manager-card', num: 12, title: 'Manager card', tier: 'teaser', status: 'live',
    scope: [
      '6–8 plain-language watch-fors that only make sense after the sections above',
      'Attack SP / who not to run on / ABS lean / 7th–8th landmines / shade threats',
      'Labelled: information, not advice',
    ],
  },
]
