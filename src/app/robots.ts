import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

// Articles, their share images (/articles/<slug>/og) and the images folder are open to every crawler. /api/ is closed, which is why the share cards do not live there.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: ['/', '/articles/', '/news-sitemap.xml'], disallow: ['/api/', '/admin/', '/preferences/', '/preview/', '/nhl/', '/dev/'] }],
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/news-sitemap.xml`],
  }
}
