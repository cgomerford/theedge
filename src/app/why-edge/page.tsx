/**
 * src/app/why-edge/page.tsx
 */

import type { Metadata } from 'next'
import SiteHeader from '@/components/SiteHeader'
import WhyEdgeClient from './WhyEdgeClient'

export const metadata: Metadata = {
  title: 'Why The Edge | More than an AI summary',
  description: `Google tells you who's playing. The Edge tells you who holds the advantage — with a public track record, factor-by-factor transparency, and a daily brief that makes you smarter before first pitch.`,
}

export default function WhyEdgePage() {
  return (
    <>
      <SiteHeader />
      <WhyEdgeClient />
    </>
  )
}