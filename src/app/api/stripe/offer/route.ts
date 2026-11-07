// GET /api/stripe/offer  →  what a new subscriber would be charged right now (no secrets, no ids).
//   annual / monthly:  { plan: 'founding'|'standard', amount, currency: 'USD', interval }  or  { plan: null, reason }
// Read by the unlock buttons so a button only appears when checkout can charge exactly the amount it prints.

import { NextResponse } from 'next/server'
import { getOffer } from '@/lib/pro-offer-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const o = await getOffer()
  return NextResponse.json({ founding: o.founding, annual: o.annual, monthly: o.monthly }, { headers: { 'Cache-Control': 'no-store' } })
}
