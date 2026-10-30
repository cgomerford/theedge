import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getArticleBySlug, getArticlesByTeam, getLatestArticles } from '@/lib/articles';
import ArticleView from '@/components/article/ArticleView';
import { ARTICLE_CSS } from '@/components/article/article-css';
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

import { SITE_HOST, SITE_URL, X_HANDLE, X_URL } from '@/lib/site';
import { authorFor } from '@/lib/authors';
import { articleUrl, authorUrl, buildNewsArticleJsonLd, descriptionOf, iso, sectionLabel, shareImage } from '@/lib/seo/news';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    return { title: 'Article not found', robots: { index: false, follow: true } };
  }

  const url = articleUrl(article.slug);
  const description = descriptionOf(article);
  const image = shareImage(article);
  const au = authorFor(article.author);
  const auUrl = authorUrl(article.author);

  return {
    title: article.title,
    description,
    alternates: { canonical: url },
    authors: [{ name: au.name, url: auUrl }],
    openGraph: {
      title: article.title,
      description,
      url,
      siteName: 'x9Lab',
      type: 'article',
      publishedTime: iso(article.published_at),
      modifiedTime: iso(article.updated_at),
      authors: [auUrl],
      section: sectionLabel(article),
      tags: article.team_tags,
      images: [{ url: image.url, width: image.width, height: image.height, alt: image.alt }],
    },
    twitter: {
      card: 'summary_large_image',
      site: X_HANDLE,
      title: article.title,
      description,
      images: [{ url: image.url, alt: image.alt }],
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

  const railLess = article.layout === 'data' || article.layout === 'quick';
  const primaryTeam = article.team_tags[0];
  const primaryTeamSlug = primaryTeam ? TEAM_CODE_TO_SLUG[primaryTeam] : undefined;

  const jsonLd = buildNewsArticleJsonLd(article);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <SiteHeader variant="page" />

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '32px 20px 60px' }}>
        <div className={`article-layout${railLess ? ' article-wide' : ''}`} style={railLess ? { maxWidth: article.layout === 'data' ? 980 : 720, margin: '0 auto' } : undefined}>
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

            <ArticleView article={article} dateLabel={dateLabel} />

            <footer
              style={{
                marginTop: 48,
                paddingTop: 20,
                borderTop: '1px solid #1A1A1A',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontFamily: 'Red Hat Display, sans-serif',
                fontSize: 11,
              }}
            >
              <span style={{ opacity: 0.6 }}>x9Lab · {SITE_HOST}</span>

              
                <a href={X_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="x9Lab on X"
                style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1A1A1A', textDecoration: 'none' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                {X_HANDLE}
              </a>
            </footer>
          </article>

          {!railLess && <aside style={{ minWidth: 0 }}>
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
                      <span style={{ fontFamily: 'Red Hat Display, sans-serif', fontSize: 12, fontWeight: 700 }}>
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
                <div style={{ fontFamily: 'Red Hat Display, sans-serif', fontSize: 17, fontWeight: 600, marginBottom: 6 }}>
                  Follow the {teamCodeToName(primaryTeam)}
                </div>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 16, lineHeight: 1.4 }}>
                  Get the daily x9Lab report for every {teamCodeToName(primaryTeam)} game — free.
                </div>
                <Link
                  href={primaryTeamSlug ? `/mlb/teams/${primaryTeamSlug}` : '/pricing'}
                  style={{
                    display: 'inline-block',
                    padding: '10px 20px',
                    background: '#FF5722',
                    color: '#fff',
                    fontFamily: 'Red Hat Display, sans-serif',
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
                <div style={railHeadStyle}>More from x9Lab</div>
                {otherArticles.map((a) => (
                  <Link key={a.id} href={`/articles/${a.slug}`} style={otherArticleLinkStyle}>
                    <div style={{ fontFamily: 'Red Hat Display, sans-serif', fontSize: 14, lineHeight: 1.3, marginBottom: 4 }}>
                      {a.title}
                    </div>
                    <div style={{ fontFamily: 'Red Hat Display, sans-serif', fontSize: 10, opacity: 0.5 }}>
                      {a.team_tags.join(', ') || 'x9Lab'}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </aside>}
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
        .article-wide.article-layout { grid-template-columns: 1fr; }
      `}</style>
      <style>{ARTICLE_CSS}</style>
    </>
  );
}

const teamChipStyle: React.CSSProperties = {
  fontFamily: 'Red Hat Display, sans-serif',
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
  fontFamily: 'Red Hat Display, sans-serif',
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