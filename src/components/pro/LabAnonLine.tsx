'use client'

import { usePathname } from 'next/navigation'
import { LAB_NOUN, tabOf } from './LabTabShell'

/** "Sign up to see Yordan Alvarez's hot zones." for whichever lab tab the visitor is on. */
export default function LabAnonLine({ lab, name }: { lab: 'batting' | 'pitching'; name: string }) {
  const noun = LAB_NOUN[lab][tabOf(usePathname())] ?? 'detail'
  return <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>Sign up to see {name}&apos;s {noun}.</span>
}
