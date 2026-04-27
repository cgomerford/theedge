import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const email = url.searchParams.get('email')

  if (!email) {
    return new NextResponse('Missing email parameter', { status: 400 })
  }

  const supa = createAdminClient()
  await supa
    .from('subscribers')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('email', email.toLowerCase())

  // Show a simple confirmation page
  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Unsubscribed · The Edge</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: Georgia, serif; background: #f4f1ea; color: #1a1a1a; max-width: 480px; margin: 80px auto; padding: 40px 20px; text-align: center;">
  <h1 style="font-size: 28px; font-weight: 600; margin: 0 0 16px;">You're unsubscribed.</h1>
  <p style="font-size: 16px; line-height: 1.5; color: #555; margin: 0 0 24px;">We've removed <strong>${escapeHtml(email)}</strong> from The Edge. You won't hear from us again.</p>
  <p style="font-size: 14px; color: #888; margin: 0 0 32px;">If this was a mistake, you can <a href="https://edgereportdaily.com" style="color: #ff5722;">resubscribe here</a>.</p>
  <a href="https://edgereportdaily.com" style="display: inline-block; background: #1a1a1a; color: #dcfa3c; padding: 12px 24px; text-decoration: none; font-family: 'Helvetica Neue', Arial, sans-serif; font-weight: 600; font-size: 14px;">Back to The Edge →</a>
</body>
</html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}