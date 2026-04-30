import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { verificationEmail } from '@/lib/emails'
import { Resend } from 'resend'
import { z } from 'zod'
import { signupLimit, getClientIp } from '@/lib/ratelimit'

const SignupSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  source: z.string().max(200).optional(),
})

export async function POST(req: NextRequest) {
  // Rate limit
  const ip = getClientIp(req)
  const { success } = await signupLimit.limit(ip)
  if (!success) {
    return NextResponse.redirect(new URL('/?error=rate-limit', req.url), { status: 303 })
  }

  let email: string | null = null
  let source: string | null = null

  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const body = await req.json()
    email = body.email
    source = body.source
  } else {
    const formData = await req.formData()
    email = formData.get('email') as string
    source = formData.get('source') as string
  }

  const parsed = SignupSchema.safeParse({ email, source })
  if (!parsed.success) {
    return NextResponse.redirect(new URL('/?error=invalid', req.url), { status: 303 })
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

  // Insert or update — set unverified, generate fresh token
  const { error: dbError } = await supa.from('subscribers').upsert(
    {
      email: parsed.data.email,
      source: parsed.data.source ?? 'web',
      email_verified: false,
      verification_sent_at: new Date().toISOString(),
    },
    { onConflict: 'email' }
  )

  if (dbError) {
    console.error('Subscribe DB error:', dbError)
    return NextResponse.redirect(new URL('/?error=server', req.url), { status: 303 })
  }

  // Fetch the verification token (auto-generated)
  // Need to set it manually first since the default isn't auto-generating on upsert
  const newToken = crypto.randomUUID().replace(/-/g, '')
  await supa
    .from('subscribers')
    .update({ verification_token: newToken })
    .eq('email', parsed.data.email)
    .is('email_verified', false)

  // Send verification email
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const content = verificationEmail(parsed.data.email, newToken)

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