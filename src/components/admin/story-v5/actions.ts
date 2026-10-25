'use server'

// src/components/admin/story-v5/actions.ts
//
// Server action the admin page calls. Admin-only (src/proxy.ts guards /admin). Returns problems as data because Next hides
// thrown error messages in production builds.

import { buildPreviewData, type PreviewProps } from './preview-data.server-fetch-allowed'
import type { PreviewData } from './types'
import { PreviewDataError } from './validate'

export type PreviewResult = { ok: true; data: PreviewData } | { ok: false; problems: string[] }

export async function runPreviewData(gamePk: number, props: PreviewProps = {}): Promise<PreviewResult> {
  try { return { ok: true, data: await buildPreviewData(gamePk, props) } }
  catch (e) {
    if (e instanceof PreviewDataError) return { ok: false, problems: e.problems }
    console.error('[runPreviewData] failed:', (e as Error).message)
    return { ok: false, problems: [`unexpected error: ${(e as Error).message}`] }
  }
}

/** Banned-word check for text typed into a custom slide. Uses the site's own copy-lint list (scripts/checks/copy-lint.ts is the source of truth).
 *  A warning, not a block: the list is strict about everyday words, so you decide. Returns the distinct words found. */
export async function lintCopy(texts: string[]): Promise<string[]> {
  const { lintText } = await import('../../../../scripts/checks/copy-lint')
  const words = new Set<string>()
  for (const t of texts) for (const h of lintText(t)) words.add(h.word.toLowerCase())
  return [...words]
}
