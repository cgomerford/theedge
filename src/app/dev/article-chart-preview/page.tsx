// src/app/dev/article-chart-preview/page.tsx
//
// Dev preview of the article chart block: the four Trevor Rogers charts exactly as the public article draws them (src/components/article/ArticleChart.tsx), from src/lib/article-chart-fixtures.ts. Not linked anywhere.
import ArticleChart from '@/components/article/ArticleChart'
import { ROGERS_CHARTS } from '@/lib/article-chart-fixtures'
import { noindex } from '@/lib/seo'

export const metadata = { ...noindex() }

export default function Page() {
  return (
    <main style={{ background: '#FAF8F3', minHeight: '100vh', padding: '24px 16px 80px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px' }}>Article chart preview</h1>
        <p style={{ fontSize: 14, color: '#5b5347', margin: 0 }}>The four Trevor Rogers charts, as the article draws them.</p>
        {ROGERS_CHARTS.map(c => <ArticleChart key={c.title} chart={c} />)}
      </div>
    </main>
  )
}
