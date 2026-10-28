// src/lib/nav/labsMenu.ts
//
// ONE source of truth for the header's "Labs" menu. To add, reorder or retire a lab,
// edit this array — LabsMenu.tsx renders whatever is here and has no per-item JSX.
//
//   status: 'live' → built;  'new' → just shipped;  'soon' → stub page ("coming soon").
//   badge:  optional text override for the pill (e.g. 'Phase 3'); otherwise derived from status.
//   tabs:   optional secondary line (tab names). Keep these in step with each lab's
//           LabShell.tsx TABS array — Edge+ is deliberately left out (it is built on the
//           internal score, which stays off casual-facing surfaces; see LabCallout.tsx).
//
// Every href is clickable, including 'soon' items — they must resolve to a stub page,
// never a dead link. Stub routes for the 'soon' items still need to be created.

export type LabStatus = 'live' | 'new' | 'soon'

export type LabsMenuItem = {
  label: string
  href: string
  status: LabStatus
  blurb?: string
  badge?: string
  tabs?: string[]
  /** which placeholder illustration the stub page draws (components/lab/LabArt.tsx) */
  art?: 'shape' | 'zones' | 'bars' | 'field' | 'chat'
}

export const LABS_MENU: LabsMenuItem[] = [
  {
    label: 'Pitching Lab', href: '/mlb/lab/pitching-lab', status: 'live',
    tabs: ['Overview', 'Arsenal', 'Location Lab', 'Hot Zone Overlay', 'Shape', 'Sequencing', 'H2H', 'Trends'],
  },
  {
    label: 'Batting Lab', href: '/mlb/lab/batting-lab', status: 'live',
    tabs: ['Overview', 'Vs Arsenal', 'Location Lab', 'Hot Zone Overlay', 'Sequencing', 'Trends', 'H2H'],
  },
  {
    label: 'Pitch Shape Lab', href: '/mlb/lab/pitch-shape', status: 'new', art: 'shape',
    blurb: 'Dial in a pitch’s velocity, ride, run and arm angle and see what pitches shaped like it have produced.',
  },
  {
    label: 'Sequencing Lab', href: '/mlb/lab/sequencing', status: 'new',
    tabs: ['Compare pitchers', 'Pitcher', 'League'],
    blurb: 'Compare how every pitcher sequences: what he throws after each pitch, in each count and with two strikes, and where he goes.',
  },
  {
    label: 'Swing Decisions', href: '/mlb/lab/swing-decisions', status: 'soon', art: 'zones',
    blurb: 'Does each hitter swing at the right pitches? We’ll show the runs his swing-or-take choices gain or lose per 100 pitches, zone by zone.',
  },
  {
    label: 'vs 95+', href: '/mlb/lab/velocity', status: 'soon', art: 'bars',
    blurb: 'How does each hitter handle high-velocity pitching? We’ll show his results and contact quality against 95+ mph pitches.',
  },
  {
    label: 'Alignment Shifter', href: '/mlb/lab/alignment', status: 'soon', badge: 'Phase 3', art: 'field',
    blurb: 'Where does a defense line up against each hitter, and how has that changed? We’ll show the alignments and what happened on balls in play.',
  },
  {
    label: 'AI Analyst', href: '/mlb/lab/ask', status: 'soon', badge: 'Phase 3', art: 'chat',
    blurb: 'Ask a plain-English question about any pitcher, hitter or matchup and get an answer built from the same Statcast data behind the labs.',
  },
]

export const STATUS_LABEL: Record<LabStatus, string> = { live: 'Live', new: 'New', soon: 'Soon' }
