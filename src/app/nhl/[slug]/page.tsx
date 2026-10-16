import { notFound } from 'next/navigation'
import { getNhlPreview } from '@/lib/nhl/preview'
import { isProViewer } from '@/lib/require-pro'
import Preview from '@/components/nhl/Preview'

// slug = {away-full-name}-at-{home-full-name}-{yyyy-mm-dd}, lower-kebab.
// Private prototype -- gated by src/lib/maintenance-gates.ts + the /nhl
// layout's noindex metadata. No nav link from the main site.
export default async function NhlPreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const preview = await getNhlPreview(slug)
  if (!preview) notFound()

  const isPro = await isProViewer()

  return <Preview preview={preview} isPro={isPro} />
}
