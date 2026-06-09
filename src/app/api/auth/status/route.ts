// src/app/api/auth/status/route.ts
import { NextResponse } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const subscriber = await getCurrentSubscriber()

    if (!subscriber) {
      return NextResponse.json({ authenticated: false, is_pro: false })
    }

    return NextResponse.json({
      authenticated: true,
      is_pro: subscriber.is_pro ?? false,
    })
  } catch {
    return NextResponse.json({ authenticated: false, is_pro: false })
  }
}