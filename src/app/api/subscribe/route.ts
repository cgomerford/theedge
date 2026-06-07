import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { verificationEmail } from '@/lib/email/auth'
import { Resend } from 'resend'
import { z } from 'zod'
import { signupLimit, getClientIp } from '@/lib/ratelimit'
import crypto from 'crypto'

const SignupSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  source: z.string().max(200).optional(),
})

// === DISPOSABLE EMAIL BLOCK LIST ===
// Domains we refuse to send to. Add more as patterns emerge.
// Source for additions: the bot incident May 19 + standard throwaway lists.
const BLOCKED_EMAIL_DOMAINS = new Set([
  // Pattern that hit us May 19
  'immenseignite.info',
  // Common throwaway / temp-mail providers
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.info',
  'guerrillamail.biz',
  'guerrillamail.org',
  'sharklasers.com',
  'grr.la',
  'tempmail.com',
  'temp-mail.org',
  'temp-mail.io',
  '10minutemail.com',
  '10minutemail.net',
  'dispostable.com',
  'maildrop.cc',
  'mintemail.com',
  'mohmal.com',
  'throwawaymail.com',
  'yopmail.com',
  'fakeinbox.com',
  'trashmail.com',
  'getairmail.com',
  'mailnesia.com',
  'mytemp.email',
  'tempinbox.com',
])

// Catch suspicious patterns even on plausible TLDs.
// .info is overrepresented in spam; combined with no MX-known domains, it's worth flagging.
function isLikelyDisposable(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) return true

  // 1. Exact match on known throwaway domains
  if (BLOCKED_EMAIL_DOMAINS.has(domain)) return true

  // 2. The specific spam pattern we saw: random-string@*.info
  //    Real .info domains are rare for personal email; bot domains are common here.
  //    Block ALL .info signups for now — we can whitelist later if a real user complains.
  if (domain.endsWith('.info')) return true

  return false
}

// === TURNSTILE VERIFICATION ===
// Calls Cloudflare's siteverify endpoint to confirm the token from the form is real.
async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  if (!process.env.TURNSTILE_SECRET_KEY) {
    console.error('TURNSTILE_SECRET_KEY not set — failing closed')
    return false
  }

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: ip,
      }),
    })
    const data = await res.json()
    if (!data.success) {
      console.warn('Turnstile verification failed:', data['error-codes'])
    }
    return data.success === true
  } catch (err) {
    console.error('Turnstile fetch error:', err)
    return false
  }
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)

  // Parse form/JSON body once, into a normalized shape
  let email: string | null = null
  let source: string | null = null
  let turnstileToken: string | null = null

  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const body = await req.json()
    email = body.email
    source = body.source
    turnstileToken = body['cf-turnstile-response'] ?? body.turnstileToken
  } else {
    const formData = await req.formData()
    email = formData.get('email') as string
    source = formData.get('source') as string
    turnstileToken = formData.get('cf-turnstile-response') as string
  }

  // === Gate 1: Turnstile token must be present and valid ===
  if (!turnstileToken) {
    console.warn('Signup rejected: missing Turnstile token')
    return NextResponse.redirect(new URL('/?error=verify-failed', req.url), { status: 303 })
  }

  const turnstileOk = await verifyTurnstile(turnstileToken, ip)
  if (!turnstileOk) {
    return NextResponse.redirect(new URL('/?error=verify-failed', req.url), { status: 303 })
  }

  // === Gate 2: Rate limit (existing) ===
  const { success } = await signupLimit.limit(ip)
  if (!success) {
    return NextResponse.redirect(new URL('/?error=rate-limit', req.url), { status: 303 })
  }

  // === Gate 3: Validate email format ===
  const parsed = SignupSchema.safeParse({ email, source })
  if (!parsed.success) {
    return NextResponse.redirect(new URL('/?error=invalid', req.url), { status: 303 })
  }

  // === Gate 4: Disposable-domain check ===
  if (isLikelyDisposable(parsed.data.email)) {
    console.warn('Signup rejected: disposable email domain', parsed.data.email)
    // Pretend it succeeded — don't tell bots which domains we block
    return NextResponse.redirect(new URL('/?check-email=1', req.url), { status: 303 })
  }

  const supa = createAdminClient()

  // Check if already exists
  const { data: existing } = await supa
    .from('subscribers')
    .select('id, email_verified')
    .eq('email', parsed.data.email)
    .single()

  // If already verified, redirect to confirmation
  if (existing?.email_verified) {
    return NextResponse.redirect(new URL('/?already-subscribed=1', req.url), { status: 303 })
  }

  // Insert or update — set unverified, generate fresh tokens
  const verificationToken = crypto.randomUUID().replace(/-/g, '')
  const preferencesToken = crypto.randomUUID().replace(/-/g, '')

  const { error: dbError } = await supa.from('subscribers').upsert(
    {
      email: parsed.data.email,
      source: parsed.data.source ?? 'web',
      email_verified: false,
      verification_token: verificationToken,
      preferences_token: preferencesToken,
      verification_sent_at: new Date().toISOString(),
    },
    { onConflict: 'email' }
  )

  if (dbError) {
    console.error('Subscribe DB error:', dbError)
    return NextResponse.redirect(new URL('/?error=server', req.url), { status: 303 })
  }

  // Send verification email
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const content = verificationEmail(parsed.data.email, verificationToken)

      await resend.emails.send({
        from: 'The Edge <hello@edgereportdaily.com>',
        to: parsed.data.email,
        subject: content.subject,
        html: content.html,
        text: content.text,
      })
    } catch (emailError) {
      console.error('Verification email failed:', emailError)
    }
  }

  return NextResponse.redirect(new URL('/?check-email=1', req.url), { status: 303 })
}