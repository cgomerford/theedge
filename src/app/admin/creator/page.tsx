// src/app/admin/creator/page.tsx
//
// Graphic Creator: the free-form canvas for X graphics (Graphic Blocks, at /admin/graphics, is the template tool filled from game data).
// Auth: src/proxy.ts already guards every /admin path.
import GraphicCreator from '@/components/graphics/creator/GraphicCreator'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Graphic Creator - x9Lab', robots: { index: false, follow: false } }

export default function CreatorPage() {
  return <GraphicCreator />
}
