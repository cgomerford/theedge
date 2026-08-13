import Link from 'next/link';
import { getLatestArticles } from '@/lib/articles';

export default async function ArticlesTeaser() {
  const articles = await getLatestArticles(4);

  if (articles.length === 0) return null;

  return (
    <section style={{ padding: '40px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 24 }}>
          Latest from The Edge
        </h2>
        <Link
          href="/articles"
          style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#FF5722' }}
        >
          View all →
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
        {articles.map((a) => (
          <Link key={a.id} href={`/articles/${a.slug}`} style={{ textDecoration: 'none', color: '#1A1A1A' }}>
            {a.hero_image && (
              <img src={a.hero_image} alt="" style={{ width: '100%', height: 130, objectFit: 'cover', marginBottom: 10 }} />
            )}
            {a.team_tags.length > 0 && (
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 10,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  padding: '2px 6px',
                  border: '1px solid #1A1A1A',
                  display: 'inline-block',
                  marginBottom: 8,
                }}
              >
                {a.team_tags[0]}
              </span>
            )}
            <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 600, fontSize: 16, lineHeight: 1.3 }}>
              {a.title}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}