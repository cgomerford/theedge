// src/app/dev/pitch-shape-preview/page.tsx
//
// Dev-only preview of the Pitch Shape Lab + Shape Sandbox on SYNTHETIC data. 404s in production.
// ?page=sandbox opens the sandbox; ?pro=0 starts in the locked (Free) view.

import { notFound } from 'next/navigation'
import PreviewClient from './PreviewClient'

export const dynamic = 'force-dynamic'

export default async function PitchShapePreview({ searchParams }: { searchParams: Promise<{ pro?: string; page?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const sp = await searchParams
  return <PreviewClient initialPro={sp.pro !== '0'} initialPage={sp.page === 'sandbox' ? 'sandbox' : 'lab'} />
}
