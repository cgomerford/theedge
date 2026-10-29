// src/components/article/ArticleView.tsx
//
// The article column as readers see it: section kicker, headline, dek, byline with read time, hero image, body. Used by the public page and by the
// admin preview, so a draft previews exactly as it will publish. The layout field changes the shape: standard, feature (hero above the headline),
// data (wide, no side rail), quick (short, no hero).

import type { Article } from '@/lib/articles';
import ArticleRenderer from '@/components/ArticleRenderer';
import { readMinutes } from '@/lib/article-doc';

export default function ArticleView({ article, dateLabel }: { article: Article; dateLabel: string | null }) {
  const layout = article.layout ?? 'standard';
  const showHero = !!article.hero_image && layout !== 'quick';
  const hero = showHero ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={article.hero_image!}
      alt={article.title}
      style={{ width: '100%', height: layout === 'feature' ? 'clamp(220px, 42vw, 460px)' : 'auto', objectFit: 'cover', borderRadius: layout === 'feature' ? 14 : 10, marginBottom: layout === 'feature' ? 28 : 32, display: 'block' }}
    />
  ) : null;

  return (
    <>
      {layout === 'feature' && hero}
      {article.section && (
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#FF5722', marginBottom: 8 }}>{article.section}</div>
      )}
      <h1 style={{ fontWeight: 800, letterSpacing: '-0.02em', fontSize: layout === 'quick' ? 'clamp(26px, 4.4vw, 36px)' : 'clamp(30px, 5vw, 46px)', lineHeight: 1.08, margin: '0 0 12px' }}>
        {article.title}
      </h1>
      {article.dek && layout !== 'quick' && (
        <p style={{ fontSize: 19, lineHeight: 1.45, color: '#5b5347', margin: '0 0 16px' }}>{article.dek}</p>
      )}
      <div style={{ fontSize: 12.5, color: '#8a8275', padding: '10px 0', borderTop: '1px solid #e7e2d8', borderBottom: '1px solid #e7e2d8', marginBottom: 28 }}>
        {article.author}
        {dateLabel ? ` · ${dateLabel}` : ''}
        {` · ${readMinutes(article.body)} min read`}
      </div>
      {layout !== 'feature' && hero}
      <ArticleRenderer body={article.body} />
    </>
  );
}
