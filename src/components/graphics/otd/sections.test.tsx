import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { OtdBody } from '@/lib/graphics/otd-types'
import OtdBodyView from './OtdBodyView'

const render = (body: OtdBody, size: 'landscape' | 'portrait' = 'landscape') => renderToStaticMarkup(createElement(OtdBodyView, { body, size }))
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('section variants', () => {
  it('kv table: labels, values and the numbered header', () => {
    const t = text(render({ sections: [{ type: 'kv', label: '1981 · Rollie Fingers', rows: [{ label: 'W-L', value: '6-3' }, { label: 'Saves', value: '28' }] }, { type: 'kv', label: 'Second', rows: [{ label: 'ERA', value: '3.34' }] }], widths: [1, 1] }))
    expect(t).toContain('01'); expect(t).toContain('02'); expect(t).toContain('1981 · Rollie Fingers'); expect(t).toContain('W-L'); expect(t).toContain('6-3')
  })
  it('linescore: every inning, totals, highlighted innings in orange', () => {
    const html = render({ sections: [{ type: 'linescore', label: 'Linescore', innings: 10, highlight: [8, 10], rows: [{ team: 'CHC', runs: [1, 0, 0, 2, 2, 1, 0, 0, 0, 2], total: '8' }, { team: 'CLE', runs: [0, 0, 1, 0, 2, 0, 0, 3, 0, 1], total: '7' }] }] })
    expect(text(html)).toContain('CHC'); expect(text(html)).toContain('10'); expect(html).toContain('#FF5722')
  })
  it('timeline, bars, games, trade and slash all render their text and never an image', () => {
    const html = render({ sections: [
      { type: 'timeline', label: 'Draft to award', points: [{ date: 'Jun 1988', label: 'Drafted 4th overall', detail: 'by Baltimore, out of Auburn' }, { date: 'Nov 1989', label: 'AL Rookie of the Year' }] },
      { type: 'vbars', label: 'HR by season', bars: [{ label: '1999', value: 42, tone: 'grey' }, { label: '2000', value: 24, tone: 'orange' }], marker: { before: 1, label: 'Trade' }, note: 'Los Angeles: 162 HR in 5 seasons' },
      { type: 'hbars', label: 'Team AVG', rows: [{ label: 'HOU', value: 0.24, display: '.240', tone: 'orange' }, { label: 'PHI', value: 0.163, display: '.163', tone: 'grey' }], max: 0.25 },
      { type: 'games', label: 'Series', games: [{ n: 1, score: '9-1', winner: 'ARI win', won: true }, { n: 3, score: '1-2', winner: 'NYY win', won: false }] },
      { type: 'trade', label: 'The trade', groups: [{ label: 'To Los Angeles', names: ['Shawn Green'] }], note: { title: 'Green with Toronto, 1999', value: '42 HR', detail: 'Drafted 16th overall in 1991' } },
      { type: 'slash', label: 'Peña', line: '.400 / .423 / .600', caption: 'AVG / OBP / SLG', detail: '10 for 25, 1 HR' },
    ], tiles: [{ label: 'Saves', value: '27', detail: '1989' }, { label: 'ERA', value: '1.69' }] }, 'portrait')
    const t = text(html)
    for (const s of ['Jun 1988', 'by Baltimore, out of Auburn', 'Los Angeles: 162 HR in 5 seasons', 'TRADE'.toLowerCase(), '.240', 'GAME', 'ARI win', 'Shawn Green', '42 HR', '.400 / .423 / .600', 'AVG / OBP / SLG', '10 for 25, 1 HR', '1.69']) expect(t.toLowerCase()).toContain(s.toLowerCase())
    expect(html).not.toMatch(/<img/i)
  })
})
