// app/admin/articles/page.tsx

import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase';

interface ArticleListRow {
  id: string;
  title: string;
  slug: string;
  status: 'draft' | 'published';
  team_tags: string[];
  published_at: string | null;
  updated_at: string;
}

async function getAllArticlesForAdmin(): Promise<ArticleListRow[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('articles')
    .select('id, title, slug, status, team_tags, published_at, updated_at')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[getAllArticlesForAdmin] Supabase error:', error.message);
    return [];
  }

  return data ?? [];
}

export default async function ArticlesListPage() {
  const articles = await getAllArticlesForAdmin();

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36 }}>⊕ Articles</h1>
        <Link href="/admin/articles/new" style={newBtnStyle}>
          + New article
        </Link>
      </div>

      {articles.length === 0 ? (
        <div style={{ opacity: 0.5, fontSize: 13 }}>No articles yet.</div>
      ) : (
        <div style={{ border: '1px solid #1A1A1A' }}>
          {articles.map((a, i) => (
            <div
              key={a.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 16px',
                borderTop: i === 0 ? 'none' : '1px solid #E4DFD3',
              }}
            >
              <div>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, marginBottom: 4 }}>
                  {a.title}
                </div>
                <div style={{ fontSize: 11, opacity: 0.55, fontFamily: 'JetBrains Mono, monospace' }}>
                  {a.team_tags.join(', ') || 'No teams tagged'} · updated{' '}
                  {new Date(a.updated_at).toLocaleDateString('en-US', { timeZone: 'America/New_York' })}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    padding: '4px 9px',
                    border: '1px solid #1A1A1A',
                    background: a.status === 'published' ? '#FF5722' : 'transparent',
                    color: a.status === 'published' ? '#FAF8F3' : '#1A1A1A',
                  }}
                >
                  {a.status}
                </span>

                {a.status === 'published' && (
                  <Link
                    href={`/articles/${a.slug}`}
                    target="_blank"
                    style={{ fontSize: 12, textDecoration: 'underline', color: '#1A1A1A' }}
                  >
                    View live
                  </Link>
                )}

                <Link
                  href={`/admin/articles/${a.id}`}
                  style={{ fontSize: 12, textDecoration: 'underline', color: '#1A1A1A' }}
                >
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const newBtnStyle: React.CSSProperties = {
  padding: '10px 18px',
  background: '#1A1A1A',
  color: '#FAF8F3',
  fontSize: 12,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  textDecoration: 'none',
};