import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
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
  const { error } = await supa.from('subscribers').upsert(
    { email: parsed.data.email, source: parsed.data.source ?? 'web' },
    { onConflict: 'email' }
  )

  if (error) {
    console.error('Subscribe error:', error)
    return NextResponse.redirect(new URL('/?error=server', req.url))
  }

  return NextResponse.redirect(new URL('/?subscribed=1', req.url))
}