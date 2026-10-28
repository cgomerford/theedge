// src/app/dev/otd-render/page.tsx
//
// Dev-only: renders one "On this day" preset at its exact size so the PNG export can be driven and checked by a script
// (/dev/otd-render?id=2026-11-02-cubs-game7&size=landscape). 404s in production. Not linked from anywhere.

import { notFound } from 'next/navigation'
import OtdRender from './OtdRender'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string; size?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const { id, size } = await searchParams
  return <OtdRender id={id ?? ''} size={size === 'portrait' ? 'portrait' : 'landscape'} />
}
