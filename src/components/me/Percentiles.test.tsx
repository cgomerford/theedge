import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Percentiles from './Percentiles'
import type { PctBlock } from '@/lib/follows/percentiles'

// What the loader hands over for a non-Pro viewer: the free 3 and a count.
const free: PctBlock = { state: 'ok', n: 600, need: 50, hardHitSmall: null, lockedCount: 7, best: null, rows: [{ key: 'xba', label: 'xBA', pct: 98 }, { key: 'xwoba', label: 'xwOBA', pct: 97 }, { key: 'bb_percent', label: 'BB%', pct: 97 }] }
const pro: PctBlock = { ...free, lockedCount: 0, rows: [...free.rows, { key: 'hard_hit_percent', label: 'Hard-hit%', pct: 90 }, { key: 'chase_percent', label: 'Chase%', pct: 14 }] }

describe('Percentiles HTML', () => {
  it('non-Pro: three real bars, placeholders with no numbers or real labels, no locked values anywhere in the markup', () => {
    const html = renderToStaticMarkup(<Percentiles block={free} isPro={false} unit="plate appearances" />)
    expect(html.match(/Pro metric/g)?.length).toBe(5)           // capped at five placeholders
    expect(html).toContain('PRO · full set')
    expect(html).toContain('See Pro')
    for (const hidden of ['Hard-hit%', 'Chase%', 'xSLG', 'Barrel%']) expect(html).not.toContain(hidden)
    const priceLike = new RegExp(['\\u00a3', '\\$\\d', '\\/m' + 'o', '\\/y' + 'r'].join('|'))   // a currency sign, a dollar amount, or a monthly / yearly rate
    expect(html).not.toMatch(priceLike)
  })
  it('Pro: the full set renders with its numbers and no placeholders', () => {
    const html = renderToStaticMarkup(<Percentiles block={pro} isPro unit="plate appearances" />)
    expect(html).toContain('Hard-hit%'); expect(html).toContain('Chase%'); expect(html).not.toContain('Pro metric')
  })
  it('small sample and pending states say so', () => {
    expect(renderToStaticMarkup(<Percentiles block={{ ...free, state: 'small', n: 20, rows: [], lockedCount: 0 }} isPro={false} unit="plate appearances" />)).toContain('Small sample (n = 20)')
    expect(renderToStaticMarkup(<Percentiles block={undefined} isPro={false} unit="plate appearances" />)).toContain('Percentiles pending')
  })
})
