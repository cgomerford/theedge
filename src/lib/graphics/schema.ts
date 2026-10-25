// src/lib/graphics/schema.ts
import { z } from 'zod'
import type { GraphicSpec } from './types'

const team = z.string().min(1).max(8)
const short = z.string().max(60)

const stat = z.object({
  group: z.string().max(40).optional(),
  team: team.optional(),
  playerId: z.number().int().positive().optional(),
  label: z.string().min(1, 'label is required').max(140),
  value: short.optional(),
  sub: z.string().max(200).optional(),
  rank: z.string().max(20).optional(),
  n: z.number().min(0).max(100).optional(),
  cells: z.array(z.string().max(60)).max(6).optional(),
  vs: z.object({ label: short, value: short, n: z.number().min(0).max(100) }).optional(),
})

export const graphicSpecSchema = z
  .object({
    id: z.string().min(1).max(60),
    template: z.enum(['collision', 'arsenal', 'contrast', 'attack', 'scoreboard', 'textlist']),
    kicker: z.string().max(60),
    title: z.string().min(1, 'title is required').max(80),
    subtitle: z.string().max(200).optional(),
    chips: z.array(z.object({ text: z.string().min(1).max(20), team })).max(4),
    columns: z.array(z.string().max(20)).max(6).optional(),
    stats: z.array(stat).min(1, 'include at least one stat').max(40),
    player: z.object({ id: z.number().int().positive(), team: team.optional() }).optional(),
    panels: z.record(z.string(), z.string().max(40)).optional(),
    notes: z.record(z.string(), z.string().max(120)).optional(),
  })
  // Labels are short everywhere except the numbered list, where the label is a headline sentence.
  .superRefine((s, ctx) => {
    if (s.template === 'textlist') return
    s.stats.forEach((st, i) => {
      if (st.label.length > 60) ctx.addIssue({ code: 'custom', path: ['stats', i, 'label'], message: 'label must be 60 characters or fewer' })
    })
  })

/** Returns the parsed spec or a list of readable "path: message" errors. */
export function validateSpec(input: unknown): { ok: true; spec: GraphicSpec } | { ok: false; errors: string[] } {
  const r = graphicSpecSchema.safeParse(input)
  if (r.success) return { ok: true, spec: r.data as GraphicSpec }
  return { ok: false, errors: r.error.issues.map(i => `${i.path.join('.') || 'spec'}: ${i.message}`) }
}
