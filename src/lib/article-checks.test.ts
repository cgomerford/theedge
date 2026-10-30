import { describe, it, expect } from 'vitest'
import { runChecks } from './article-checks'
import type { TiptapDoc } from './articles'

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const doc = (...c: Record<string, unknown>[]): TiptapDoc => ({ type: 'doc', content: c })
const base = { title: 'Why the Phillies bullpen changed', dek: '', excerpt: 'A look at three relievers.', seoDescription: '', heroImage: 'https://x/y.png', section: 'What changed', teamTags: ['PHI'], layout: 'standard' }

describe('runChecks', () => {
  it('blocks on betting and prediction words, and names the word', () => {
    const r = runChecks({ ...base, body: doc(p('Our pick is the over, a lock tonight.')) })
    expect(r.blocking).toBe(true)
    expect(r.checks.filter(c => c.level === 'error').map(c => c.text).join(' ')).toMatch(/pick/i)
  })
  it('does not block on everyday words the UI list bans (start, add, value)', () => {
    const r = runChecks({ ...base, body: doc(p('He made the start and the value of his sinker held. Source: Statcast.')) })
    expect(r.blocking).toBe(false)
  })
  it('catches banned words inside blocks (pull quote, stat label, caption)', () => {
    const r = runChecks({ ...base, body: doc({ type: 'figure', attrs: { src: 'https://a/b.png', alt: 'a lock', caption: '', credit: '' } }) })
    expect(r.blocking).toBe(true)
  })
  it('warns about missing alt text, a number without a sample, and a missing source line', () => {
    const r = runChecks({ ...base, body: doc(p('He held hitters to .231 and a 34% whiff rate.'), { type: 'figure', attrs: { src: 'https://a/b.png', alt: '' } }) })
    const ids = r.checks.filter(c => c.level === 'warn').map(c => c.id)
    expect(ids).toEqual(expect.arrayContaining(['alt', 'sample', 'source']))
    expect(r.blocking).toBe(false)
  })
  it('is satisfied when the sample and source are there', () => {
    const r = runChecks({ ...base, body: doc(p('He held hitters to .231 over 212 pitches. Source: Statcast, 2026.')) })
    expect(r.checks.find(c => c.id === 'sample')?.level).toBe('ok')
    expect(r.checks.find(c => c.id === 'source')?.level).toBe('ok')
  })
  it('requires a description to publish', () => {
    const r = runChecks({ ...base, excerpt: '', body: doc(p('Text.')) })
    expect(r.blocking).toBe(true)
  })
  it('a quick take needs no hero image', () => {
    const r = runChecks({ ...base, layout: 'quick', heroImage: '', body: doc(p('Short.')) })
    expect(r.checks.find(c => c.id === 'hero')?.level).toBe('ok')
  })
})

describe('an empty editor', () => {
  it('serialises with no content array and still checks without throwing', () => {
    const r = runChecks({ ...base, body: { type: 'doc' } as TiptapDoc })
    expect(r.words).toBe(0)
    expect(r.blocking).toBe(false)
  })
})

describe('share-preview checks', () => {
  it('warns when the hero is under 1200x675 and errors on an excerpt over 200 characters', () => {
    const small = runChecks({ ...base, heroWidth: 800, heroHeight: 450, body: doc(p('Text.')) })
    expect(small.checks.find(c => c.id === 'herosize')?.level).toBe('warn')
    const long = runChecks({ ...base, excerpt: 'x'.repeat(201), body: doc(p('Text.')) })
    expect(long.blocking).toBe(true)
    const ok = runChecks({ ...base, heroWidth: 1600, heroHeight: 900, body: doc(p('Text.')) })
    expect(ok.checks.find(c => c.id === 'herosize')?.level).toBe('ok')
  })
})
