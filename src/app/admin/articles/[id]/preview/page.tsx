// The reader view of any article, draft or live, inside /admin (so it is behind the admin sign-in). Same ArticleView and CSS as the public page.
import { notFound } from 'next/navigation';
import SiteHeader from '@/components/SiteHeader';
import ArticleView from '@/components/article/ArticleView';
import { ARTICLE_CSS } from '@/components/article/article-css';
import { getArticleById } from '@/lib/articles';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Article preview', robots: { index: false, follow: false } };

export default async function ArticlePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = await getArticleById(id);
  if (!article) notFound();
  const wide = article.layout === 'data' ? 980 : article.layout === 'quick' ? 720 : 800;
  const label = article.status === 'published' && article.published_at
    ? new Date(article.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' })
    : 'Draft';
  return (
    <>
      <SiteHeader variant="page" />
      <div style={{ background: '#FDE047', fontSize: 12.5, fontWeight: 700, textAlign: 'center', padding: '6px 10px' }}>Preview. Readers see this once it is published ({article.status === 'published' ? 'live' : 'still a draft'}).</div>
      <div className={article.layout === 'data' || article.layout === 'quick' || article.layout === 'feature' ? 'article-wide' : undefined} style={{ maxWidth: wide, margin: '0 auto', padding: '32px 20px 60px' }}>
        <article><ArticleView article={article} dateLabel={label} /></article>
      </div>
      <style>{ARTICLE_CSS}</style>
    </>
  );
}
