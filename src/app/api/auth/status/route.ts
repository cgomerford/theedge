import { getCurrentSubscriber } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function GET() {
  const subscriber = await getCurrentSubscriber()
  return NextResponse.json({
    authenticated: !!subscriber,
    role: subscriber?.role ?? null,
  })
}