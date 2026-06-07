// src/lib/emails.ts — MIGRATION SHIM
//
// Re-exports from src/lib/email/ so existing imports don't break.
// Delete this file once all imports point at the new paths directly.

export type { BriefGameContext } from './email/daily-brief'

import { buildDailyBrief } from './email/daily-brief'
import type { BriefGameContext } from './email/daily-brief'

export function dailyBriefEmail(
  email: string,
  preferencesToken: string,
  games: BriefGameContext[],
  teamShortNames: string[],
  isPro: boolean = false,
) {
  return buildDailyBrief({
    recipientEmail: email,
    preferencesToken,
    games,
    teamShortNames,
    isPro,
  })
}