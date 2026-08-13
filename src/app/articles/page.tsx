import Link from 'next/link';
import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import { createAdminClient } from '@/lib/supabase';

export const metadata: Metadata = {
  title: 'Articles — The Edge',
  description: 'Analysis, breakdowns, and reads from The Edge.',
};

export const revalidate = 1800;

interface ArticleListItem {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  hero_image: string | null;
  team_tags: string[];
  author: string;
  published_at: string | null;
}

async function getAllPublishedArticles(): Promise<ArticleListItem[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('articles')
    .select('id, title, slug, excerpt, hero_image, team_tags, author, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(50); // simple cap — swap for real pagination once volume warrants it

  if (error) {
    console.error('[getAllPublishedArticles] Supabase error:', error.message);
    return [];
  }

  return data ?? [];
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

export default async function ArticlesIndexPage() {
  const articles = await getAllPublishedArticles();
  const [featured, ...rest] = articles;

  // Every team code that actually appears in a published article — the
  // filter bar should never show a team with nothing behind it.
  const teamsInUse = Array.from(new Set(articles.flatMap((a) => a.team_tags))).sort();

  return (
    <>
      <SiteHeader variant="page" />

      <div style={{ background: '#FAF8F3', minHeight: '100vh' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 20px 80px' }}>
          {/* ── Masthead ── */}
          <div style={{ marginBottom: 32, borderBottom: '2px solid #1A1A1A', paddingBottom: 20 }}>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#FF5722',
                marginBottom: 6,
              }}
            >
              § The Edge Report
            </div>
            <h1
              style={{
                fontFamily: 'Fraunces, serif',
                fontWeight: 700,
                fontSize: 'clamp(32px, 5vw, 48px)',
                lineHeight: 1.05,
                color: '#1A1A1A',
              }}
            >
              Articles
            </h1>
          </div>

          {articles.length === 0 ? (
            <div style={{ opacity: 0.5, fontSize: 14, padding: '60px 0', textAlign: 'center' }}>
              No articles published yet.
            </div>
          ) : (
            <>
              {/* ── Team filter pills ── */}
              {teamsInUse.length > 1 && (
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 36, paddingBottom: 4 }}>
                  <Link
                    href="/articles"
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      padding: '6px 14px',
                      background: '#1A1A1A',
                      color: '#FAF8F3',
                      whiteSpace: 'nowrap',
                      textDecoration: 'none',
                    }}
                  >
                    All
                  </Link>
                  {teamsInUse.map((code) => (
                    <Link
                      key={code}
                      href={`/articles?team=${code}`}
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        padding: '6px 14px',
                        background: 'rgba(26,26,26,0.06)',
                        color: '#1A1A1A',
                        whiteSpace: 'nowrap',
                        textDecoration: 'none',
                      }}
                    >
                      {code}
                    </Link>
                  ))}
                </div>
              )}

              {/* ── Featured lead story ── */}
              {featured && (
                <Link
                  href={`/articles/${featured.slug}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: featured.hero_image ? '1.2fr 1fr' : '1fr',
                    gap: 32,
                    marginBottom: 48,
                    paddingBottom: 40,
                    borderBottom: '1px solid #E4DFD3',
                    textDecoration: 'none',
                    color: '#1A1A1A',
                    alignItems: 'center',
                  }}
                  className="featured-article"
                >
                  {featured.hero_image && (
                    <img
                      src={featured.hero_image}
                      alt=""
                      style={{ width: '100%', height: 340, objectFit: 'cover' }}
                    />
                  )}
                  <div>
                    {featured.team_tags.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                        {featured.team_tags.map((t) => (
                          <span key={t} style={teamChipStyle}>
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    <div
                      style={{
                        fontFamily: 'Fraunces, serif',
                        fontWeight: 700,
                        fontSize: 'clamp(24px, 3.4vw, 34px)',
                        lineHeight: 1.12,
                        marginBottom: 14,
                      }}
                    >
                      {featured.title}
                    </div>
                    {featured.excerpt && (
                      <p style={{ fontSize: 15, lineHeight: 1.6, opacity: 0.75, marginBottom: 16 }}>
                        {featured.excerpt}
                      </p>
                    )}
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, opacity: 0.5 }}>
                      {featured.author} · {formatDate(featured.published_at)}
                    </div>
                  </div>
                </Link>
              )}

              {/* ── Grid of remaining articles ── */}
              {rest.length > 0 && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: 32,
                  }}
                >
                  {rest.map((a) => (
                    <Link
                      key={a.id}
                      href={`/articles/${a.slug}`}
                      style={{ textDecoration: 'none', color: '#1A1A1A', display: 'block' }}
                    >
                      {a.hero_image && (
                        <img
                          src={a.hero_image}
                          alt=""
                          style={{ width: '100%', height: 170, objectFit: 'cover', marginBottom: 14 }}
                        />
                      )}
                      {a.team_tags.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                          {a.team_tags.map((t) => (
                            <span key={t} style={teamChipStyle}>
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      <div
                        style={{
                          fontFamily: 'Fraunces, serif',
                          fontWeight: 600,
                          fontSize: 19,
                          lineHeight: 1.25,
                          marginBottom: 10,
                        }}
                      >
                        {a.title}
                      </div>
                      {a.excerpt && (
                        <p style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.7, marginBottom: 10 }}>
                          {a.excerpt}
                        </p>
                      )}
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, opacity: 0.5 }}>
                        {a.author} · {formatDate(a.published_at)}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        .featured-article:hover {
          opacity: 0.92;
        }
        @media (max-width: 760px) {
          .featured-article {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </>
  );
}

const teamChipStyle: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 10,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  padding: '3px 7px',
  border: '1px solid #1A1A1A',
};