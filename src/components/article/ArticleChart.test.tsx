import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ArticleChart from './ArticleChart'
import ArticleRenderer from '../ArticleRenderer'
import { ROGERS_CHARTS } from '@/lib/article-chart-fixtures'
import { validateChart } from '@/lib/article-chart'

describe('ArticleChart', () => {
  it('draws every Rogers chart with its title, alt text, caption, wordmark and a hidden data table, and nothing red or green', () => {
    for (const c of ROGERS_CHARTS) {
      const html = renderToStaticMarkup(<ArticleChart chart={c} />)
      expect(html).toContain(c.title.replace(/'/g, '&#x27;'))
      expect(html).toContain('aria-label=')
      expect(html).toContain(c.caption!.slice(0, 20))
      expect(html).toContain('<table')
      expect(html).toContain('x9')
      expect(html).not.toMatch(/Outfit|JetBrains|—/)
      expect(html.toLowerCase()).not.toMatch(/#(ff0000|d4533b|1d9e75|b2182b|13694f|a8391f)/)
      for (const s of c.series) for (const v of s.values) expect(html).toContain(`<td>${v}</td>`)
    }
  })
  it('the stored block renders in the article body, and an incomplete one is skipped', () => {
    const doc = { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
      { type: 'chartBlock', attrs: { ...ROGERS_CHARTS[1] } },
      { type: 'chartBlock', attrs: { type: 'bar', title: '', labels: [], series: [], alt: '' } },
    ] }
    const html = renderToStaticMarkup(<ArticleRenderer body={doc as never} />)
    expect(html).toContain('x9c-plot')
    expect(html.match(/x9-chart/g)?.length).toBe(1)
    expect(validateChart(ROGERS_CHARTS[1])).toEqual([])
  })
})
