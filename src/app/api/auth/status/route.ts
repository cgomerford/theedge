// src/app/api/auth/status/route.ts
//
// Who is looking: drives the header, the mobile menu and the sign-up prompts. Uncached on purpose so the pages around it can stay ISR.
// Signed out returns only { authenticated: false, is_pro: false }. Signed in adds two letters of initials and the email's local part
// (the header's account label until a display name exists); no other personal data.
import { NextResponse } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import { resolveViewer, getLookupsLeft, ASK_LOOKUPS_PER_DAY } from '@/lib/ask-lookups'

export const dynamic = 'force-dynamic'

/** First letter of the first two parts of the email's local part (split on . _ -), else its first two letters. Uppercase. */
function initialsFromEmail(email: string): string {
  const local = email.split('@')[0] ?? ''
  const parts = local.split(/[._-]+/).filter(Boolean)
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2)
  return (letters || '?').toUpperCase()
}

export async function GET(req: Request) {
  try {
    const subscriber = await getCurrentSubscriber()
    // Lookups left today for the ask lab: null for Pro and when counting is unavailable. Read-only: no cookie, no charge.
    const lookupsLeft = await getLookupsLeft(await resolveViewer(req)).catch(() => null)
    const perDay = lookupsLeft == null ? null : ASK_LOOKUPS_PER_DAY

    if (!subscriber) {
      return NextResponse.json({ authenticated: false, is_pro: false, lookupsLeft, perDay })
    }

    return NextResponse.json({
      authenticated: true,
      is_pro: subscriber.is_pro ?? false,
      initials: initialsFromEmail(subscriber.email),
      label: (subscriber.email.split('@')[0] ?? '').slice(0, 40),
      lookupsLeft, perDay,
    })
  } catch {
    return NextResponse.json({ authenticated: false, is_pro: false })
  }
}
