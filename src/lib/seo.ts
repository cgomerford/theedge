import type { Metadata } from 'next'
import { SITE_NAME, SITE_URL } from '@/lib/site'

// Our own share image (src/app/opengraph-image.tsx). Child pages that set openGraph must repeat it, or Next drops it.
const DEFAULT_OG_IMAGE = { url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: 'x9Lab: MLB game previews in plain numbers' }

/** Absolute canonical URL for a path. Query strings and hashes are always removed. */
export function canonical(path: string): string {
  const clean = path.split('#')[0].split('?')[0]
  return SITE_URL + (clean.startsWith('/') ? clean : `/${clean}`)
}

/** Metadata fragment for pages that should stay out of search results. */
export function noindex(): Pick<Metadata, 'robots'> {
  return { robots: { index: false, follow: true } }
}

/**
 * Standard metadata for a public page: title, description, canonical (no query string),
 * and matching og:title / og:description / og:url. The root layout's title template adds " · x9Lab".
 */
export function pageMeta(opts: { title: string; description: string; path: string; type?: 'website' | 'article' }): Metadata {
  const url = canonical(opts.path)
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url },
    openGraph: { title: opts.title, description: opts.description, url, type: opts.type ?? 'website', siteName: SITE_NAME, images: [DEFAULT_OG_IMAGE] },
    twitter: { card: 'summary_large_image', title: opts.title, description: opts.description, images: [DEFAULT_OG_IMAGE.url] },
  }
}
