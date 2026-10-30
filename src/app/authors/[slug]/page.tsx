// src/app/authors/[slug]/page.tsx
//
// An author page: name, role, a short bio and every published article by them, newest first. Linked from each article's byline and named in its NewsArticle JSON-LD
// (author.url). The slug is derived from the author's name (src/lib/authors.ts), so any name used on an article gets a page; a slug with no articles and no entry is a 404.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import SiteHeader from '@/components/SiteHeader'
import { BreadcrumbSchema } from '@/components/StructuredData'
import { createAdminClient } from '@/lib/supabase'
import { authorFor, authorSlug, getAuthorBySlug } from '@/lib/authors'
import { excerptOf, iso, sectionLabel } from '@/lib/seo/news'
import { pageMeta } from '@/lib/seo'
import { SITE_URL } from '@/lib/site'
import type { Article } from '@/lib/articles'

export const revalidate = 300

type Row = Pick<Article, 'id' | 'title' | 'slug' | 'excerpt' | 'seo_description' | 'body' | 'author' | 'published_at' | 'sport'>

async function articlesBy(slug: string): Promise<Row[]> {
  const { data, error } = await createAdminClient()
    .from('articles')
    .select('id, title, slug, excerpt, seo_description, body, author, published_at, sport')
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .limit(500)
  if (error) { console.error('[authors/[slug]] Supabase error:', error.message); return [] }
  return ((data ?? []) as unknown as Row[]).filter(r => authorSlug(r.author) === slug)
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const rows = await articlesBy(slug)
  const known = getAuthorBySlug(slug)
  if (!known && rows.length === 0) return { title: 'Author not found', robots: { index: false, follow: true } }
  const au = authorFor(known?.name ?? rows[0].author)
  return pageMeta({ title: `${au.name}, ${au.role}`, description: au.bio, path: `/authors/${slug}` })
}

export default async function AuthorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const rows = await articlesBy(slug)
  const known = getAuthorBySlug(slug)
  if (!known && rows.length === 0) notFound()
  const au = authorFor(known?.name ?? rows[0].author)
  const url = `${SITE_URL}/authors/${au.slug}`
  const ld = {
    '@context': 'https://schema.org', '@type': 'ProfilePage', url, name: au.name,
    mainEntity: { '@type': 'Person', name: au.name, url, description: au.bio, jobTitle: au.role, worksFor: { '@type': 'Organization', name: 'x9Lab', url: SITE_URL }, ...(au.xUrl ? { sameAs: [au.xUrl] } : {}) },
  }
  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'Articles', path: '/articles' }, { name: au.name, path: `/authors/${au.slug}` }]} />
      <SiteHeader variant="page" />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 16px 80px' }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.14em', color: '#B83A0E', textTransform: 'uppercase' }}>{au.role}</div>
        <h1 style={{ margin: '6px 0 12px', fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.05 }}>{au.name}</h1>
        <p style={{ margin: '0 0 8px', fontSize: 17, lineHeight: 1.6, color: '#3a352c' }}>{au.bio}</p>
        <p style={{ margin: '0 0 28px', fontSize: 14 }}>
          <Link href="/about" style={{ color: '#B83A0E', fontWeight: 700 }}>About x9Lab</Link>
          {au.xUrl && <> · <a href={au.xUrl} rel="me noopener noreferrer" target="_blank" style={{ color: '#B83A0E', fontWeight: 700 }}>On X</a></>}
          {' · '}<Link href="/contact" style={{ color: '#B83A0E', fontWeight: 700 }}>Contact</Link>
        </p>
        <h2 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 800, letterSpacing: '.12em', color: '#FF5722', textTransform: 'uppercase' }}>Articles</h2>
        {rows.length === 0 ? <p style={{ fontSize: 15, color: '#5b5347' }}>No published articles yet.</p> : rows.map(r => (
          <article key={r.id} style={{ padding: '16px 0', borderTop: '1px solid #e7e2d8' }}>
            <div style={{ fontSize: 12, color: '#8a8275', marginBottom: 4 }}>
              {sectionLabel(r)} · {r.published_at ? <time dateTime={iso(r.published_at)}>{new Date(r.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' })}</time> : null}
            </div>
            <h3 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, letterSpacing: '-.01em', lineHeight: 1.2 }}><Link href={`/articles/${r.slug}`} style={{ color: '#1A1A1A', textDecoration: 'none' }}>{r.title}</Link></h3>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: '#5b5347' }}>{excerptOf(r)}</p>
          </article>
        ))}
      </div>
    </main>
  )
}
