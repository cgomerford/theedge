import { NextRequest, NextResponse } from 'next/server'
import { createLoginLink } from '@/lib/auth'
import { loginLinkEmail } from '@/lib/email/auth'
import { readAttribution } from '@/lib/attribution'
import { isLikelyDisposable } from '@/lib/disposable-email'
import { signupLimit, getClientIp } from '@/lib/ratelimit'
import { Resend } from 'resend'
import { z } from 'zod'
import { CONTACT_EMAIL } from '@/lib/site'

const Schema = z.object({
  email: z.string().email().toLowerCase().trim(),
})

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)

  // Parse form once so we can grab the Turnstile token
  const formData = await req.formData()
  const turnstileToken = formData.get('cf-turnstile-response') as string

  // Sent from /signup as hidden fields; /login sends none. Errors go back to the page the form came from.
  const attribution = readAttribution((k) => formData.get(k))
  const fromSignup = formData.get('from') === 'signup'
  const wantsJson = (req.headers.get('accept') ?? '').includes('application/json')
  const back = (query: string) => {
    if (!fromSignup) return `/login?${query}`
    const params = new URLSearchParams(query)
    for (const [k, v] of Object.entries(attribution)) params.set(k, v)
    return `/signup?${params}`
  }
  // The pop-up form asks for JSON so it can swap to "Check your email" without leaving the page.
  const reply = (query: string) => {
    if (!wantsJson) return NextResponse.redirect(new URL(back(query), req.url), { status: 303 })
    const q = new URLSearchParams(query)
    const error = q.get('error')
    return NextResponse.json(error ? { ok: false, error } : { ok: true }, { status: error ? 400 : 200 })
  }

  // === Turnstile gate ===
  if (!turnstileToken) {
    return reply('error=verify-failed')
  }

  try {
    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY ?? '',
        response: turnstileToken,
        remoteip: ip,
      }),
    })
    const verifyData = await verifyRes.json()
    if (!verifyData.success) {
      return reply('error=verify-failed')
    }
  } catch {
    return reply('error=verify-failed')
  }

  // Rate limit reuses signupLimit (5/min/IP) — same protection profile
  const { success } = await signupLimit.limit(ip)
  if (!success) {
    return reply('error=rate-limit')
  }

  const parsed = Schema.safeParse({ email: formData.get('email') })

  if (!parsed.success) {
    return reply('error=invalid')
  }

  // Signup creates accounts, so throwaway domains get the same fake success the old form gave them.
  if (fromSignup && isLikelyDisposable(parsed.data.email)) return reply('sent=1')

  const token = await createLoginLink(parsed.data.email, attribution, { createIfMissing: fromSignup })

  // ALWAYS show the same success message — never reveal if email exists
  // (prevents email-enumeration attacks)
  if (token && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const content = loginLinkEmail(parsed.data.email, token)
      const { error: sendError } = await resend.emails.send({
        from: `x9Lab <${CONTACT_EMAIL}>`,
        to: parsed.data.email,
        subject: content.subject,
        html: content.html,
        text: content.text,
      })
      if (sendError) console.error('[Login email] Resend rejected the send:', sendError.name, sendError.message)
    } catch (e) {
      console.error('Login email failed:', e)
    }
  }

  return reply('sent=1')
}