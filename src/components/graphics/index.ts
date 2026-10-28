// src/components/graphics/index.ts
import type { ComponentType } from 'react'
import type { GraphicImages, GraphicSpec, SizeKey, TemplateId } from '@/lib/graphics/types'
import ArsenalBars from './ArsenalBars'
import AttackTable from './AttackTable'
import ContrastBars from './ContrastBars'
import ScoreboardCard from './ScoreboardCard'
import StatCollisionCard from './StatCollisionCard'
import TextListCard from './TextListCard'
import { OtdBlock, SotdBlock } from './otd/OtdBlocks'

export type BlockProps = { spec: GraphicSpec; size: SizeKey; images?: GraphicImages }

export const BLOCKS: Record<TemplateId, ComponentType<BlockProps>> = {
  collision: StatCollisionCard,
  arsenal: ArsenalBars,
  contrast: ContrastBars,
  attack: AttackTable,
  scoreboard: ScoreboardCard,
  textlist: TextListCard,
  otd: OtdBlock,
  sotd: SotdBlock,
}

export const TEMPLATE_NAMES: Record<TemplateId, string> = {
  collision: 'Stat collision',
  arsenal: 'Arsenal and strikeouts',
  contrast: 'October vs season',
  attack: 'Attack table',
  scoreboard: 'Scoreboard',
  textlist: 'Numbered list',
  otd: 'On this day',
  sotd: 'Stat of the day',
}
