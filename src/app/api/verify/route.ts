import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { welcomeEmail } from '@/lib/emails'
import { Resend } from 'resend'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(new URL('/?verify-error=missing', req.url), { status: 303 })
  }

  const supa = createAdminClient()

  // Find the subscriber
  const { data: sub, error } = await supa
    .from('subscribers')
    .select('id, email, email_verified, preferences_token')
    .eq('verification_token', token)
    .single()

  if (error || !sub) {
    return NextResponse.redirect(new URL('/?verify-error=invalid', req.url), { status: 303 })
  }

  if (sub.email_verified) {
    return NextResponse.redirect(
      new URL(`/preferences/${sub.preferences_token}?already-verified=1`, req.url),
      { status: 303 }
    )
  }

  // Mark verified
  await supa
    .from('subscribers')
    .update({ email_verified: true })
    .eq('id', sub.id)

  // Send the welcome email NOW (which includes preferences link)
  if (process.env.RESEND_API_KEY && sub.preferences_token) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const content = welcomeEmail(sub.email, sub.preferences_token)
      await resend.emails.send({
        from: 'The Edge <hello@edgereportdaily.com>',
        to: sub.email,
        subject: content.subject,
        html: content.html,
        text: content.text,
      })
    } catch (e) {
      console.error('Welcome email failed:', e)
    }
  }

  return NextResponse.redirect(
    new URL(`/preferences/${sub.preferences_token}?verified=1`, req.url),
    { status: 303 }
  )
}