import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { welcomeEmail } from '@/lib/emails'
import { Resend } from 'resend'
import { z } from 'zod'

const SignupSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  source: z.string().max(200).optional(),
})

export async function POST(req: NextRequest) {
  let email: string | null = null
  let source: string | null = null

  // Accept both form posts and JSON
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
    return NextResponse.redirect(new URL('/?error=invalid', req.url))
  }

  const supa = createAdminClient()

  // Check if already subscribed (avoid duplicate welcome emails)
  const { data: existing } = await supa
    .from('subscribers')
    .select('id, created_at')
    .eq('email', parsed.data.email)
    .single()

  const isNewSignup = !existing

  // Save to Supabase
  const { error: dbError } = await supa.from('subscribers').upsert(
    { email: parsed.data.email, source: parsed.data.source ?? 'web' },
    { onConflict: 'email' }
  )

  if (dbError) {
    console.error('Subscribe DB error:', dbError)
    return NextResponse.redirect(new URL('/?error=server', req.url))
  }

  // Send welcome email — only for genuinely new signups
  if (isNewSignup && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const email_content = welcomeEmail(parsed.data.email)

      await resend.emails.send({
        from: 'The Edge <hello@edgereportdaily.com>',
        to: parsed.data.email,
        subject: email_content.subject,
        html: email_content.html,
        text: email_content.text,
      })
    } catch (emailError) {
      // Don't fail the signup if email fails — log it and move on
      console.error('Welcome email failed:', emailError)
    }
  }

  return NextResponse.redirect(new URL('/?subscribed=1', req.url))
}