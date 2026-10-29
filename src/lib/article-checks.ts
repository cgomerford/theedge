// src/lib/article-checks.ts
//
// The article writer's Checks tab, as one pure function so it is tested and the server can reuse the blocking rule. Each check is ok, a warning
// (worth fixing) or an error (publishing is blocked: banned wording). The word list is src/lib/banned-words.ts, the same one the site's copy check uses.

import type { TiptapDoc } from '@/lib/articles'
import { lintProse } from '@/lib/banned-words'
import { docImages, docText, hasSourceLine, readMinutes, sampleMentions, wordCount } from '@/lib/article-doc'

export interface CheckInput {
  title: string
  dek: string
  excerpt: string
  seoDescription: string
  heroImage: string
  section: string
  teamTags: string[]
  layout: string
  body: TiptapDoc
}

export type CheckLevel = 'ok' | 'warn' | 'error'
export interface Check { id: string; level: CheckLevel; text: string; detail?: string }

export function runChecks(i: CheckInput): { checks: Check[]; blocking: boolean; words: number; minutes: number } {
  const checks: Check[] = []
  const add = (id: string, level: CheckLevel, text: string, detail?: string) => checks.push({ id, level, text, detail })

  const hits = lintProse([i.title, i.dek, i.excerpt, i.seoDescription, docText(i.body)].join('\n'))
  if (hits.length) {
    const seen = new Set<string>()
    for (const h of hits) {
      const k = h.word.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      add(`word-${k}`, 'error', `Banned word: "${h.word}"`, `…${h.context}…`)
    }
  } else add('words', 'ok', 'No betting, prediction or fantasy-advice wording')

  const tl = i.title.trim().length
  if (!tl) add('title', 'error', 'Write a headline')
  else if (tl > 70) add('title', 'warn', `Headline is ${tl} characters`, 'Search results cut it off after about 60 to 70.')
  else add('title', 'ok', `Headline is ${tl} characters`)

  if (!i.section) add('section', 'warn', 'Choose a section (the kicker above the headline)')
  else add('section', 'ok', `Section: ${i.section}`)

  if (!(i.excerpt.trim() || i.seoDescription.trim())) add('desc', 'error', 'Write an excerpt or a search description', 'It is the text under the link in search and on X.')
  else add('desc', 'ok', 'Search and share description is set')

  if (i.layout === 'quick') add('hero', 'ok', 'Quick take: no hero image needed')
  else if (!i.heroImage.trim()) add('hero', 'warn', 'No hero image', 'The share card and the article header use it.')
  else add('hero', 'ok', 'Hero image is set')

  if (!i.teamTags.length) add('teams', 'warn', 'No team tagged', 'Team pages and the "More from x9Lab" rail use the tags.')
  else add('teams', 'ok', `${i.teamTags.length} team${i.teamTags.length === 1 ? '' : 's'} tagged`)

  const imgs = docImages(i.body)
  const noAlt = imgs.filter(m => !m.alt.trim())
  if (noAlt.length) add('alt', 'warn', `${noAlt.length} image${noAlt.length === 1 ? ' has' : 's have'} no alt text`, 'Describe each picture for readers who cannot see it.')
  else if (imgs.length) add('alt', 'ok', 'Every image has alt text')

  const { numbers, samples } = sampleMentions(i.body)
  if (numbers > 0 && samples === 0) add('sample', 'warn', 'Numbers without a sample', 'Put the sample beside a figure, e.g. "n = 212" or "212 pitches".')
  else if (numbers > 0) add('sample', 'ok', 'Samples are named beside the numbers')

  const stat = ((i.body.content ?? []) as unknown as { type: string; attrs?: { items?: { sample?: string }[] } }[]).filter(n => n.type === 'statRow')
  const missing = stat.reduce((n, s) => n + (s.attrs?.items ?? []).filter(it => !it.sample?.trim()).length, 0)
  if (missing) add('statsample', 'warn', `${missing} stat${missing === 1 ? '' : 's'} without a sample`)

  if (numbers > 0 || stat.length) {
    if (!hasSourceLine(i.body)) add('source', 'warn', 'No source line', 'End with where the numbers come from, e.g. "Source: Statcast, 2026 regular season."')
    else add('source', 'ok', 'Source line present')
  }

  const words = wordCount(i.body)
  if (words < 80) add('length', 'warn', `Only ${words} words`)
  return { checks, blocking: checks.some(c => c.level === 'error'), words, minutes: readMinutes(i.body) }
}
