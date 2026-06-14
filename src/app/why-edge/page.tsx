// src/app/why-edge/page.tsx  —  server component wrapper
import { getOverallStats } from '@/lib/track-record'
import SiteHeader from '@/components/SiteHeader'
import WhyEdgeClient from './WhyEdgeClient'

export const revalidate = 3600

export const metadata = {
  title: 'Why The Edge · Smart-friend reads for every level of fan',
  description:
    'The Edge meets you where you are — casual fan to GM-level analyst. Same game, four reads. See how the 8-factor model works and what makes it different.',
}

export default async function WhyEdgePage() {
  const stats = await getOverallStats()
  return (
    <>
      <SiteHeader variant="page" />
      <WhyEdgeClient stats={stats} />
    </>
  )
}