// src/lib/graphics/schema.ts
import { z } from 'zod'
import type { GraphicSpec } from './types'

const team = z.string().min(1).max(8)
const short = z.string().max(60)

const tone = z.enum(['orange', 'grey'])
const t = (n: number) => z.string().max(n)
const otdSection = z.discriminatedUnion('type', [
  z.object({ type: z.literal('kv'), label: t(60), rows: z.array(z.object({ label: t(60), value: t(60) })).max(10) }),
  z.object({ type: z.literal('linescore'), label: t(60), innings: z.number().int().min(1).max(18), highlight: z.array(z.number().int()).max(18), rows: z.array(z.object({ team: t(8), runs: z.array(z.number().int().min(0).max(99)).max(18), total: t(4) })).max(4) }),
  z.object({ type: z.literal('timeline'), label: t(60), points: z.array(z.object({ date: t(30), label: t(80), detail: t(80).optional() })).max(5) }),
  z.object({ type: z.literal('vbars'), label: t(60), bars: z.array(z.object({ label: t(12), value: z.number().min(0), display: t(12).optional(), tone })).max(12), marker: z.object({ before: z.number().int().min(0), label: t(16) }).optional(), note: t(80).optional(), max: z.number().positive().optional() }),
  z.object({ type: z.literal('hbars'), label: t(60), rows: z.array(z.object({ label: t(12), value: z.number().min(0), display: t(12), tone })).max(8), max: z.number().positive().optional() }),
  z.object({ type: z.literal('games'), label: t(80), games: z.array(z.object({ n: z.number().int().min(1).max(9), score: t(12), winner: t(20), won: z.boolean() })).max(7) }),
  z.object({ type: z.literal('trade'), label: t(60), groups: z.array(z.object({ label: t(30), names: z.array(t(40)).max(6) })).max(4), note: z.object({ title: t(60), value: t(20), detail: t(80).optional() }).optional() }),
  z.object({ type: z.literal('slash'), label: t(60), line: t(30), caption: t(30), detail: t(60).optional() }),
])
const otdBody = z.object({
  sections: z.array(otdSection).max(3), widths: z.array(z.number().positive()).max(3).optional(),
  tiles: z.array(z.object({ label: t(40), value: t(16), detail: t(40).optional() })).max(4).optional(),
})

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
    template: z.enum(['collision', 'arsenal', 'contrast', 'attack', 'scoreboard', 'textlist', 'otd', 'sotd']),
    kicker: z.string().max(60),
    title: z.string().min(1, 'title is required').max(80),
    subtitle: z.string().max(200).optional(),
    chips: z.array(z.object({ text: z.string().min(1).max(20), team })).max(4),
    columns: z.array(z.string().max(20)).max(6).optional(),
    stats: z.array(stat).max(40),
    player: z.object({ id: z.number().int().positive(), team: team.optional() }).optional(),
    panels: z.record(z.string(), z.string().max(40)).optional(),
    notes: z.record(z.string(), z.string().max(120)).optional(),
    otd: z.object({ date: t(40), body: otdBody }).optional(),
  })
  // Labels are short everywhere except the numbered list, where the label is a headline sentence.
  .superRefine((s, ctx) => {
    if (s.template === 'otd' || s.template === 'sotd') {
      if (!s.otd) ctx.addIssue({ code: 'custom', path: ['otd'], message: 'this card needs a date and a body' })
      else if (s.otd.body.sections.length === 0 && !(s.otd.body.tiles?.length)) ctx.addIssue({ code: 'custom', path: ['otd', 'body'], message: 'include at least one section or tile' })
      return
    }
    if (s.stats.length === 0) ctx.addIssue({ code: 'custom', path: ['stats'], message: 'include at least one stat' })
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
