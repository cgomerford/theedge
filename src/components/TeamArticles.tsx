import Link from 'next/link';
import { getArticlesByTeam } from '@/lib/articles';

interface TeamArticlesProps {
  teamCode: string; // e.g. 'NYY' — must match article.team_tags values exactly
}

export default async function TeamArticles({ teamCode }: TeamArticlesProps) {
  const articles = await getArticlesByTeam(teamCode, 5);

  if (articles.length === 0) return null;

  return (
    <div style={{ border: '1px solid #1A1A1A', padding: 18, background: '#FAF8F3' }}>
      <div
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          opacity: 0.6,
          marginBottom: 12,
          paddingBottom: 8,
          borderBottom: '1px solid #E4DFD3',
        }}
      >
        Analysis
      </div>

      {articles.map((a) => (
        <Link
          key={a.id}
          href={`/articles/${a.slug}`}
          style={{ display: 'block', padding: '10px 0', borderBottom: '1px solid #F0ECE1', textDecoration: 'none', color: '#1A1A1A' }}
        >
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 14, lineHeight: 1.3 }}>{a.title}</div>
        </Link>
      ))}
    </div>
  );
}