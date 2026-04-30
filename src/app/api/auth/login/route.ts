import { NextRequest, NextResponse } from 'next/server'
import { createLoginLink } from '@/lib/auth'
import { loginLinkEmail } from '@/lib/emails'
import { signupLimit, getClientIp } from '@/lib/ratelimit'
import { Resend } from 'resend'
import { z } from 'zod'

const Schema = z.object({
  email: z.string().email().toLowerCase().trim(),
})

export async function POST(req: NextRequest) {
  // Rate limit reuses signupLimit (5/min/IP) — same protection profile
  const ip = getClientIp(req)
  const { success } = await signupLimit.limit(ip)
  if (!success) {
    return NextResponse.redirect(new URL('/login?error=rate-limit', req.url), { status: 303 })
  }

  const formData = await req.formData()
  const parsed = Schema.safeParse({ email: formData.get('email') })

  if (!parsed.success) {
    return NextResponse.redirect(new URL('/login?error=invalid', req.url), { status: 303 })
  }

  const token = await createLoginLink(parsed.data.email)

  // ALWAYS show the same success message — never reveal if email exists
  // (prevents email-enumeration attacks)
  if (token && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const content = loginLinkEmail(parsed.data.email, token)
      await resend.emails.send({
        from: 'The Edge <hello@edgereportdaily.com>',
        to: parsed.data.email,
        subject: content.subject,
        html: content.html,
        text: content.text,
      })
    } catch (e) {
      console.error('Login email failed:', e)
    }
  }

  return NextResponse.redirect(new URL('/login?sent=1', req.url), { status: 303 })
}