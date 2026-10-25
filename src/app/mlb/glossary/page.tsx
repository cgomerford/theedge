import GlossaryClient from './GlossaryClient'
import { pageMeta } from '@/lib/seo'
import { BreadcrumbSchema } from '@/components/StructuredData'

export const metadata = pageMeta({
  title: 'MLB stats glossary',
  description:
    'Plain-English definitions of xwOBA, barrel rate, whiff rate, run value and other pitch-tracking terms, and what each number does and does not tell you.',
  path: '/mlb/glossary',
})

export default function GlossaryPage() {
  return (
    <>
      <GlossaryClient />
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'MLB', path: '/mlb' }, { name: 'Glossary', path: '/mlb/glossary' }]} />
    </>
  )
}
