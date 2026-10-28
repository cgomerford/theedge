// src/lib/graphics/otd-presets.ts
//
// The week-1 "On this day" presets (2 to 8 Nov 2026). Every word and number is copied as supplied: nothing is rounded, reformatted or corrected here.
// Tiles are LABEL | VALUE | DETAIL. None of these carries a team logo, headshot or team mark (the template has no field for one).

import type { GraphicSpec } from './types'

const base = { template: 'otd' as const, kicker: 'On this day', chips: [], stats: [] }

export const OTD_PRESETS: GraphicSpec[] = [
  {
    ...base, id: '2026-11-02-cubs-game7', title: 'Cubs 8, Cleveland 7 in 10 innings', subtitle: 'World Series Game 7. First title since 1908.',
    otd: {
      date: '2 Nov 2016',
      body: {
        sections: [{
          type: 'linescore', label: 'Linescore', innings: 10, highlight: [8, 10],
          rows: [{ team: 'CHC', runs: [1, 0, 0, 2, 2, 1, 0, 0, 0, 2], total: '8' }, { team: 'CLE', runs: [0, 0, 1, 0, 2, 0, 0, 3, 0, 1], total: '7' }],
        }],
        tiles: [
          { label: 'Years between titles', value: '108', detail: '1908 to 2016' },
          { label: 'Game time', value: '4:28', detail: '10 innings' },
          { label: 'CLE in the 8th', value: '3', detail: 'runs to tie it' },
          { label: 'CHC in the 10th', value: '2', detail: 'Montgomery got the final out' },
        ],
      },
    },
  },
  {
    ...base, id: '2026-11-03-brewers-cy-youngs', title: 'Brewers win the AL Cy Young twice', subtitle: 'Back-to-back years, same date. A reliever and a starter.',
    otd: {
      date: '3 Nov 1981 and 1982',
      body: {
        widths: [1, 1],
        sections: [
          { type: 'kv', label: '1981 · Rollie Fingers', rows: [{ label: 'W-L', value: '6-3' }, { label: 'Saves', value: '28' }, { label: 'ERA', value: '1.04' }, { label: 'First-place votes', value: '22 of 28' }] },
          { type: 'kv', label: '1982 · Pete Vuckovich', rows: [{ label: 'W-L', value: '18-6' }, { label: 'ERA', value: '3.34' }, { label: 'Runner-up', value: 'Jim Palmer' }, { label: 'Role', value: 'Starter' }] },
        ],
      },
    },
  },
  {
    ...base, id: '2026-11-04-dbacks-game7', title: 'D-backs 3, Yankees 2 in Game 7', subtitle: "Luis Gonzalez's bases-loaded single off Mariano Rivera won the World Series.",
    otd: {
      date: '4 Nov 2001',
      body: {
        sections: [{
          type: 'games', label: 'Series by game, Arizona score first',
          games: [
            { n: 1, score: '9-1', winner: 'ARI win', won: true }, { n: 2, score: '4-0', winner: 'ARI win', won: true }, { n: 3, score: '1-2', winner: 'NYY win', won: false },
            { n: 4, score: '3-4', winner: 'NYY win', won: false }, { n: 5, score: '2-3', winner: 'NYY win', won: false }, { n: 6, score: '15-2', winner: 'ARI win', won: true },
            { n: 7, score: '3-2', winner: 'ARI win', won: true },
          ],
        }],
        tiles: [
          { label: 'Randy Johnson wins', value: '3', detail: 'Games 2, 6 and 7' },
          { label: 'Series runs', value: '37-14', detail: 'Arizona outscored New York' },
          { label: 'Arizona AVG', value: '.264', detail: 'team, 7 games' },
          { label: 'Yankees AVG', value: '.183', detail: 'team, 7 games' },
        ],
      },
    },
  },
  {
    ...base, id: '2026-11-05-astros-pena', title: 'Astros 4, Phillies 1 in Game 6', subtitle: 'Houston won the World Series. Jeremy Peña was MVP.',
    otd: {
      date: '5 Nov 2022',
      body: {
        widths: [600, 508],
        sections: [
          { type: 'slash', label: 'Jeremy Peña in the series', line: '.400 / .423 / .600', caption: 'AVG / OBP / SLG', detail: '10 for 25, 1 HR' },
          { type: 'hbars', label: 'Team AVG', max: 0.25, rows: [{ label: 'HOU', value: 0.24, display: '.240', tone: 'orange' }, { label: 'PHI', value: 0.163, display: '.163', tone: 'grey' }] },
        ],
        tiles: [
          { label: 'Peña AVG', value: '.400', detail: '10 for 25' },
          { label: 'Peña HR', value: '1', detail: 'in the series' },
          { label: 'Phillies AVG', value: '.163', detail: 'as a team' },
          { label: 'Phillies strikeouts', value: '71', detail: 'in 6 games' },
        ],
      },
    },
  },
  {
    ...base, id: '2026-11-06-walter-johnson', title: 'Walter Johnson is born', subtitle: '21 seasons, all with Washington.',
    otd: {
      date: '6 Nov 1887',
      body: {
        widths: [1, 1],
        sections: [
          { type: 'kv', label: 'Career', rows: [{ label: 'Wins', value: '417' }, { label: 'Shutouts', value: '110' }, { label: 'ERA', value: '2.17' }, { label: 'Innings', value: '5,914.1' }] },
          { type: 'kv', label: '1913 alone', rows: [{ label: 'W-L', value: '36-7' }, { label: 'ERA', value: '1.14' }, { label: 'Shutouts', value: '11' }, { label: 'Walks', value: '38 in 346 IP' }] },
        ],
        tiles: [
          { label: 'Career shutouts', value: '110', detail: 'still the career record' },
          { label: 'Career wins', value: '417', detail: '21 seasons' },
          { label: 'Career ERA', value: '2.17', detail: 'over 5,914.1 innings' },
          { label: 'Strikeouts', value: '3,509', detail: 'career' },
        ],
      },
    },
  },
  {
    ...base, id: '2026-11-07-gregg-olson', title: 'Gregg Olson wins AL Rookie of the Year', subtitle: 'Baltimore Orioles closer. First reliever to win the AL award.',
    otd: {
      date: '7 Nov 1989',
      body: {
        sections: [{
          type: 'timeline', label: 'Draft to award',
          points: [
            { date: 'Jun 1988', label: 'Drafted 4th overall', detail: 'by Baltimore, out of Auburn' },
            { date: 'Sep 1988', label: 'MLB debut', detail: 'that September' },
            { date: 'Nov 1989', label: 'AL Rookie of the Year', detail: '26 of 28 first-place votes' },
          ],
        }],
        tiles: [
          { label: 'First-place votes', value: '26/28', detail: 'AL ROY 1989' },
          { label: 'Saves', value: '27', detail: '1989' },
          { label: 'ERA', value: '1.69', detail: '1989' },
          { label: 'Strikeouts', value: '90', detail: 'in 85 innings' },
        ],
      },
    },
  },
  {
    ...base, id: '2026-11-08-green-mondesi-trade', title: 'Dodgers trade Mondesi for Shawn Green', subtitle: 'Raúl Mondesi and Pedro Borbón Jr. to Toronto for Shawn Green and Jorge Núñez.',
    otd: {
      date: '8 Nov 1999',
      body: {
        widths: [400, 708],
        sections: [
          {
            type: 'trade', label: 'The trade',
            groups: [{ label: 'TO LOS ANGELES', names: ['Shawn Green', 'Jorge Núñez'] }, { label: 'TO TORONTO', names: ['Raúl Mondesi', 'Pedro Borbón Jr.'] }],
            note: { title: 'Green with Toronto, 1999', value: '42 HR', detail: 'Drafted 16th overall in 1991' },
          },
          {
            type: 'vbars', label: 'Shawn Green HR by season', note: 'Los Angeles: 162 HR in 5 seasons', marker: { before: 1, label: 'TRADE' },
            bars: [
              { label: '1999', value: 42, tone: 'grey' }, { label: '2000', value: 24, tone: 'orange' }, { label: '2001', value: 49, tone: 'orange' },
              { label: '2002', value: 42, tone: 'orange' }, { label: '2003', value: 19, tone: 'orange' }, { label: '2004', value: 28, tone: 'orange' },
            ],
          },
        ],
      },
    },
  },
]
