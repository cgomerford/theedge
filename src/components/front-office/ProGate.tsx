// Server-side Pro gate. `render` is a function so the Pro children are never
// even constructed for a non-Pro viewer (their data is fetched inside it).
// `isPro` is required and never defaulted.

import type { ReactNode } from 'react'

export default function ProGate({ isPro, render, fallback }: { isPro: boolean; render: () => ReactNode; fallback: ReactNode }) {
  return <>{isPro ? render() : fallback}</>
}
