// src/lib/graphics/presets.ts
//
// The six World Series Game 1 specs. Verified numbers only; the minus sign is the real U+2212.
// A "" cell renders as a small grey dot. G4 carries `panels` so its two table tabs match the mockup.

import type { GraphicSpec } from './types'

const KICKER = 'World Series Game 1 Scout'
const TB_MIL = [{ text: 'TB', team: 'TB' as const }, { text: 'MIL', team: 'MIL' as const }]

export const PRESETS: GraphicSpec[] = [
  {
    id: 'ws-g1-hook', template: 'collision', kicker: KICKER, title: 'The first collision',
    subtitle: "Milwaukee chases less than any lineup. Martinez's best pitch is a changeup.",
    chips: TB_MIL,
    stats: [
      { group: 'hero', team: 'MIL', label: 'Brewers chase rate', value: '26.7%', sub: 'lowest in MLB', rank: '1st' },
      { group: 'hero', team: 'TB', playerId: 607259, label: 'Martinez changeup chase rate', value: '38.6%', sub: 'his best pitch' },
      { group: 'tile', team: 'TB', label: 'Martinez walk rate', value: '3.6%', sub: 'walks almost nobody' },
      { group: 'tile', team: 'TB', label: 'Rays strikeout rate', value: '18.7%', sub: 'lowest in MLB', rank: '1st' },
      { group: 'tile', team: 'TB', label: 'Rays infield Outs Above Average', value: '−32', sub: 'tied 3rd weakest' },
      { group: 'tile', team: 'TB', label: 'Rays outfield Outs Above Average', value: '+38', sub: 'best in MLB', rank: '1st' },
    ],
  },
  {
    id: 'ws-g2-martinez', template: 'arsenal', kicker: KICKER, title: 'Nick Martinez, RHP', player: { id: 607259, team: 'TB' },
    subtitle: 'Five days of rest. Last start Oct 17: 5.1 innings, 79 pitches.',
    chips: [{ text: 'TB', team: 'TB' }],
    columns: ['Usage', 'Whiff', 'xwOBA'],
    stats: [
      { group: 'pitch', label: 'Sinker', value: '92.4 mph', n: 31.7, cells: ['31.7%', '9.3%', '.336'] },
      { group: 'pitch', label: 'Changeup', value: '78.3 mph', n: 25.8, cells: ['25.8%', '30.7%', '.241'] },
      { group: 'pitch', label: 'Cutter', value: '89.2 mph', n: 22.0, cells: ['22.0%', '', ''] },
      { group: 'pitch', label: 'Four seam', value: '92.7 mph', n: 12.6, cells: ['12.6%', '', '.307'] },
      { group: 'ks', label: 'Strikeouts ended on sinker', value: '42', n: 42 },
      { group: 'ks', label: 'Strikeouts ended on changeup', value: '38', n: 38 },
      { group: 'tile', label: 'Changeup share with two strikes', value: '31.6%' },
      { group: 'tile', label: 'Homers allowed to lefties', value: '13 of 22' },
      { group: 'tile', label: 'xwOBA by time through order', value: '.285 .310 .341' },
      { group: 'tile', label: 'Sinker usage, October vs season', value: '14% vs 32%' },
    ],
  },
  {
    id: 'ws-g3-misiorowski', template: 'contrast', kicker: KICKER, title: 'Jacob Misiorowski, RHP', player: { id: 694819, team: 'MIL' },
    subtitle: 'Eleven days of rest. Same 100.6 mph four seam. October looks different.',
    chips: [{ text: 'MIL', team: 'MIL' }],
    columns: ['Usage', 'Whiff', 'xwOBA'],
    stats: [
      { group: 'contrast', label: 'Four seam whiff rate', value: '16.1%', n: 16.1, vs: { label: 'Season', value: '40.2%', n: 40.2 }, sub: 'October' },
      { group: 'contrast', label: 'Foul balls per swing', value: '54.3%', n: 54.3, vs: { label: 'Season', value: '39.1%', n: 39.1 }, sub: 'October' },
      { group: 'contrast', label: 'Pitches per plate appearance', value: '4.92', n: 49.2, vs: { label: 'Season', value: '4.00', n: 40.0 }, sub: 'October' },
      { group: 'pitch', label: 'Four seam', value: '100.6 mph', n: 63.3, cells: ['63.3%', '40.2%', '.230'] },
      { group: 'pitch', label: 'Cutter', value: '95.8 mph', n: 14.0, cells: ['14.0%', '', ''] },
      { group: 'pitch', label: 'Slider', value: '91.9 mph', n: 10.8, cells: ['10.8%', '35.3%', ''] },
      { group: 'pitch', label: 'Curve', value: '88.0 mph', n: 10.7, cells: ['10.7%', '43.9%', '.167'] },
      { group: 'tile', label: 'Strikeouts ended on four seam', value: '166' },
      { group: 'tile', label: 'Strikeouts ended on curve', value: '43' },
      { group: 'tile', label: 'Vs lefties xwOBA', value: '.194', sub: '44.7% strikeouts' },
      { group: 'tile', label: 'xwOBA, 1st and 2nd time through', value: '.195 .246' },
    ],
  },
  {
    id: 'ws-g4-attack', template: 'attack', kicker: KICKER, title: 'Attack map',
    subtitle: 'Regular season. Hitters are projected starters.',
    chips: [...TB_MIL, { text: 'PROJECTED', team: 'neutral' }],
    columns: ['Pitch', 'xwOBA', 'Whiff'],
    panels: { TB: 'Rays hitters vs Misiorowski', MIL: 'Brewers hitters vs Martinez' },
    stats: [
      { group: 'TB', label: 'Hicks', cells: ['97+ mph', '.385', '7.7%'] },
      { group: 'TB', label: 'Mesa Jr.', cells: ['Four seam', '.423', '31%'] },
      { group: 'TB', label: 'Caminero', cells: ['Fastball', '.402', ''] },
      { group: 'TB', label: 'Caminero', cells: ['Breaking', '', '31%'] },
      { group: 'TB', label: 'DeLuca', cells: ['Breaking', '', '34%'] },
      { group: 'TB', label: 'Walls', cells: ['Offspeed', '', '37%'] },
      { group: 'MIL', label: 'Mitchell', cells: ['Offspeed', '', '53%'] },
      { group: 'MIL', label: 'Bauers', cells: ['Offspeed', '', '46%'] },
      { group: 'MIL', label: 'Yelich', cells: ['Breaking', '', '42%'] },
      { group: 'MIL', label: 'Bauers', cells: ['Fastball', '.410', ''] },
      { group: 'MIL', label: 'Chourio', cells: ['Fastball', '.382', ''] },
      { group: 'MIL', label: 'Turang', cells: ['Fastball', '.367', ''] },
      { group: 'MIL', label: 'Contreras', cells: ['Fastball', '.362', ''] },
      { group: 'oaa', team: 'TB', label: 'Rays infield OAA', value: '−32', sub: 'Caminero −12, Palacios −8, Walls −3' },
      { group: 'oaa', team: 'TB', label: 'Rays outfield OAA', value: '+38', sub: 'DeLuca +13, Simpson +9, Mesa Jr. +7' },
      { group: 'oaa', team: 'MIL', label: 'MIL ground ball rate', value: '48.1%', sub: '1st in MLB' },
      { group: 'oaa', team: 'TB', label: 'TB ground ball rate', value: '45.6%', sub: '3rd in MLB' },
    ],
  },
  {
    id: 'ws-g5-scoreboard', template: 'scoreboard', kicker: KICKER, title: 'Catchers, running game, strike zone',
    subtitle: 'Who can steal, who can stop it, and who wins the challenges.',
    chips: TB_MIL,
    stats: [
      { group: 'catcher', team: 'MIL', label: 'Contreras', value: '34%', sub: '25 of 73 runners caught', cells: ['Pop time', '1.92'] },
      { group: 'catcher', team: 'TB', label: 'Hicks', value: '16%', sub: '11 of 69 runners caught', cells: ['Pop time', '1.97'] },
      { group: 'run', team: 'TB', label: 'Rays steals, postseason', value: '11 for 11', sub: 'all on pitches 1 to 3' },
      { group: 'run', team: 'TB', label: 'Simpson', value: '46 for 60' },
      { group: 'run', team: 'TB', label: 'Walls', value: '21 for 24' },
      { group: 'run', team: 'MIL', label: 'Hamilton', value: '30 for 37' },
      { group: 'run', team: 'MIL', label: 'Chourio', value: '23 for 28' },
      { group: 'run', team: 'MIL', label: 'Mitchell sprint speed', value: '29.8 ft/s' },
      { group: 'run', team: 'TB', label: 'Martinez allowed', value: '13 SB, 3 CS' },
      { group: 'run', team: 'MIL', label: 'Misiorowski allowed', value: '2 SB, 1 CS' },
      { group: 'abs', team: 'MIL', label: 'Contreras', value: '86 of 155', n: 55.5, sub: '55%' },
      { group: 'abs', team: 'TB', label: 'Hicks', value: '17 of 30', n: 56.7, sub: '57%' },
      { group: 'abs', team: 'MIL', label: 'Brewers', value: '14 of 25', n: 56.0, sub: '56%' },
      { group: 'abs', team: 'TB', label: 'Rays', value: '6 of 9', n: 66.7, sub: '67%' },
    ],
  },
  {
    id: 'ws-g6-watchfor', template: 'textlist', kicker: KICKER, title: 'Watch for',
    chips: TB_MIL,
    stats: [
      { label: 'The first Brewers swing at a Martinez changeup below the zone.', value: '1', sub: 'If they take it, he is back to sinkers and cutters through the middle, where the damage has been.' },
      { label: "Misiorowski's four seam after two strikes.", value: '2', sub: 'October has been foul balls, not whiffs. If the Rays keep fouling it off, the pitch count climbs before the fifth.' },
      { label: 'Where the first ground balls go.', value: '3', sub: "Caminero at third and Palacios at second are the weakest spots on the Rays' infield." },
      { label: 'The first Rays runner on base, and the pitch he goes on.', value: '4', sub: 'All 11 steals this month came early in the count, with Contreras behind the plate.' },
      { label: 'Lineup cards and bullpen availability, confirmed before first pitch.', value: '5' },
    ],
  },
]
