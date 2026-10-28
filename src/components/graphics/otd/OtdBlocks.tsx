// src/components/graphics/otd/OtdBlocks.tsx
//
// The two registered templates. Both are the same shell and body; only the kicker prefix differs ("ON THIS DAY" / "STAT OF THE DAY").
// `images` is accepted to match the other blocks and ignored on purpose: these cards draw no team logo, headshot or team mark.

import type { ComponentType } from 'react'
import type { GraphicImages, GraphicSpec, SizeKey } from '@/lib/graphics/types'
import OtdBodyView from './OtdBodyView'
import OtdShell, { type OtdKind } from './OtdShell'

type Props = { spec: GraphicSpec; size: SizeKey; images?: GraphicImages }

const make = (kind: OtdKind): ComponentType<Props> => function OtdBlock({ spec, size }: Props) {
  return (
    <OtdShell kind={kind} date={spec.otd?.date ?? ''} headline={spec.title} subline={spec.subtitle} size={size}>
      <OtdBodyView body={spec.otd?.body ?? { sections: [] }} size={size} />
    </OtdShell>
  )
}

export const OtdBlock = make('otd')
export const SotdBlock = make('sotd')
