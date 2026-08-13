import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getArticleBySlug, getArticlesByTeam, getLatestArticles } from '@/lib/articles';
import ArticleRenderer from '@/components/ArticleRenderer';
import SiteHeader from '@/components/SiteHeader';
import { TEAM_CODE_TO_SLUG, teamCodeToId, teamCodeToName } from '@/lib/team-codes';
import { getMLBTeamLeaders } from '@/lib/mlb-homepage';
// PitcherPercentileStrip is not wired up yet — the Article type has no
// subject_player_id / subject_player_name fields, and there's no
// getPitcherPercentiles fetch. Re-add the import and the rail block below
// together once both exist. See TODO further down.
// import PitcherPercentileStrip from '@/components/stats/PitcherPercentileStrip';

interface PageProps {
  params: Promise<{ slug: string }>;
}

const SITE_URL = 'https://edgereportdaily.com';
const X_HANDLE = '@edgereportdaily';
const X_URL = 'https://x.com/edgereportdaily';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    return { title: 'Article not found — The Edge' };
  }

  const canonicalUrl = `${SITE_URL}/articles/${article.slug}`;

  return {
    title: `${article.title} — The Edge`,
    description: article.excerpt ?? undefined,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: article.title,
      description: article.excerpt ?? undefined,
      url: canonicalUrl,
      siteName: 'The Edge',
      images: article.hero_image ? [article.hero_image] : undefined,
      type: 'article',
      publishedTime: article.published_at ?? undefined,
      modifiedTime: article.updated_at,
    },
    twitter: {
      card: 'summary_large_image',
      site: X_HANDLE,
      title: article.title,
      description: article.excerpt ?? undefined,
      images: article.hero_image ? [article.hero_image] : undefined,
    },
  };
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  const canonicalUrl = `${SITE_URL}/articles/${article.slug}`;

  const dateLabel = article.published_at
    ? new Date(article.published_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'America/New_York',
      })
    : null;

  const teamsForRail = article.team_tags.slice(0, 2);
  const teamLeaderResults = await Promise.all(
    teamsForRail.map(async (code) => {
      const teamId = teamCodeToId(code);
      if (!teamId) return { code, leaders: [] };
      const leaders = await getMLBTeamLeaders(teamId);
      return { code, leaders };
    })
  );

  const relatedByTeam = article.team_tags[0]
    ? await getArticlesByTeam(article.team_tags[0], 6)
    : [];
  const latestFallback = relatedByTeam.length < 4 ? await getLatestArticles(6) : [];
  const otherArticles = [...relatedByTeam, ...latestFallback]
    .filter((a) => a.id !== article.id)
    .filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i)
    .slice(0, 5);

  // TODO: player percentile rail — blocked on two things that don't exist
  // yet: (1) subject_player_id / subject_player_name columns on `articles`
  // (Article type has neither right now), and (2) a confirmed
  // getPitcherPercentiles-style fetch in lib/pitcher-percentiles. Add the
  // columns + migration, confirm the fetch function's real name/shape,
  // then restore this block and the PitcherPercentileStrip import above.

  const primaryTeam = article.team_tags[0];
  const primaryTeamSlug = primaryTeam ? TEAM_CODE_TO_SLUG[primaryTeam] : undefined;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    description: article.excerpt ?? undefined,
    image: article.hero_image ? [article.hero_image] : undefined,
    datePublished: article.published_at ?? undefined,
    dateModified: article.updated_at,
    author: { '@type': 'Person', name: article.author },
    publisher: { '@type': 'Organization', name: 'The Edge', url: SITE_URL },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <SiteHeader variant="page" />

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '32px 20px 60px' }}>
        <div className="article-layout">
          <article style={{ minWidth: 0 }}>
            {article.team_tags.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                {article.team_tags.map((team) => (
                  <span key={team} style={teamChipStyle}>
                    {team}
                  </span>
                ))}
              </div>
            )}

            <h1
              style={{
                fontFamily: 'Fraunces, serif',
                fontWeight: 700,
                fontSize: 'clamp(28px, 5vw, 44px)',
                lineHeight: 1.1,
                marginBottom: 12,
              }}
            >
              {article.title}
            </h1>

            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, opacity: 0.6, marginBottom: 28 }}>
              {article.author}
              {dateLabel ? ` · ${dateLabel}` : ''}
            </div>

            {article.hero_image && (
              <img
                src={article.hero_image}
                alt={article.title}
                style={{ width: '100%', height: 'auto', marginBottom: 32 }}
              />
            )}

            <ArticleRenderer body={article.body} />

            <footer
              style={{
                marginTop: 48,
                paddingTop: 20,
                borderTop: '1px solid #1A1A1A',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 11,
              }}
            >
              <span style={{ opacity: 0.6 }}>The Edge Report™ · edgereportdaily.com</span>

              
                <a href={X_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="The Edge on X"
                style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1A1A1A', textDecoration: 'none' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                {X_HANDLE}
              </a>
            </footer>
          </article>

          <aside style={{ minWidth: 0 }}>
            {/* Player percentile strip removed until subject_player_id /
                subject_player_name exist on Article and the fetch is
                confirmed — see TODO above generateMetadata's return. */}

            {teamLeaderResults.map(({ code, leaders }) =>
              leaders.length > 0 ? (
                <div key={code} style={railCardStyle}>
                  <div style={railHeadStyle}>{teamCodeToName(code)} Leaders</div>
                  {leaders.map((l) => (
                    <div key={`${l.category}-${l.label}`} style={leaderRowStyle}>
                      <span style={{ fontSize: 10, opacity: 0.5, width: 32 }}>{l.label}</span>
                      <span style={{ flex: 1, fontSize: 13 }}>{l.name}</span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700 }}>
                        {l.value}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null
            )}

            {/* Follow this team CTA */}
            {primaryTeam && (
              <div style={{ ...railCardStyle, background: '#1A1A1A', color: '#FAF8F3', textAlign: 'center', padding: '24px 18px' }}>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600, marginBottom: 6 }}>
                  Follow the {teamCodeToName(primaryTeam)}
                </div>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 16, lineHeight: 1.4 }}>
                  Get the daily Edge read for every {teamCodeToName(primaryTeam)} game — free.
                </div>
                <Link
                  href={primaryTeamSlug ? `/mlb/teams/${primaryTeamSlug}` : '/pricing'}
                  style={{
                    display: 'inline-block',
                    padding: '10px 20px',
                    background: '#FF5722',
                    color: '#fff',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 11,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    textDecoration: 'none',
                  }}
                >
                  Follow team →
                </Link>
              </div>
            )}

            {otherArticles.length > 0 && (
              <div style={railCardStyle}>
                <div style={railHeadStyle}>More from The Edge</div>
                {otherArticles.map((a) => (
                  <Link key={a.id} href={`/articles/${a.slug}`} style={otherArticleLinkStyle}>
                    <div style={{ fontFamily: 'Fraunces, serif', fontSize: 14, lineHeight: 1.3, marginBottom: 4 }}>
                      {a.title}
                    </div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, opacity: 0.5 }}>
                      {a.team_tags.join(', ') || 'The Edge'}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>

      <style>{`
        .article-layout {
          display: grid;
          grid-template-columns: 1fr;
          gap: 40px;
        }
        @media (min-width: 900px) {
          .article-layout {
            grid-template-columns: 1fr 320px;
          }
        }
        .article-body {
          font-family: Georgia, serif;
          font-size: 17px;
          line-height: 1.7;
          color: #1A1A1A;
        }
        .article-body p { margin-bottom: 1.3em; }
        .article-body h2 {
          font-family: 'Fraunces', serif;
          font-weight: 600;
          font-size: 26px;
          margin: 1.6em 0 0.6em;
        }
        .article-body h3 {
          font-family: 'Fraunces', serif;
          font-weight: 600;
          font-size: 20px;
          margin: 1.4em 0 0.5em;
        }
        .article-body ul, .article-body ol { margin: 0 0 1.3em 1.4em; }
        .article-body li { margin-bottom: 0.4em; }
        .article-body blockquote {
          border-left: 3px solid #FF5722;
          padding-left: 16px;
          margin: 1.6em 0;
          font-style: italic;
          opacity: 0.85;
        }
        .article-body a {
          color: #FF5722;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .article-body img { margin: 1.8em 0; }
        @media (max-width: 640px) {
          .article-body { font-size: 16px; }
        }
      `}</style>
    </>
  );
}

const teamChipStyle: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 11,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  padding: '4px 8px',
  border: '1px solid #1A1A1A',
};

const railCardStyle: React.CSSProperties = {
  border: '1px solid #1A1A1A',
  padding: 18,
  marginBottom: 24,
  background: '#FAF8F3',
};

const railHeadStyle: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 10,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  opacity: 0.6,
  marginBottom: 12,
  paddingBottom: 8,
  borderBottom: '1px solid #E4DFD3',
};

const leaderRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 0',
  borderBottom: '1px solid #F0ECE1',
};

const otherArticleLinkStyle: React.CSSProperties = {
  display: 'block',
  padding: '10px 0',
  borderBottom: '1px solid #F0ECE1',
  textDecoration: 'none',
  color: '#1A1A1A',
};