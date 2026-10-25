// src/app/why-edge/page.tsx  —  server component wrapper
import { getOverallStats } from '@/lib/track-record'
import SiteHeader from '@/components/SiteHeader'
import WhyEdgeClient from './WhyEdgeClient'
import { pageMeta } from '@/lib/seo'
import { BreadcrumbSchema } from '@/components/StructuredData'

export const revalidate = 3600

export const metadata = pageMeta({
  title: 'The case for plain numbers',
  description:
    'Why x9Lab puts the sample size beside every stat, and how plain-number game previews differ from dense stat sites and long-form previews. Read the reasoning.',
  path: '/why-edge',
})

export default async function WhyEdgePage() {
  const stats = await getOverallStats()
  return (
    <>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'Why x9Lab', path: '/why-edge' }]} />
      <SiteHeader variant="page" />
      <WhyEdgeClient stats={stats} />
    </>
  )
}