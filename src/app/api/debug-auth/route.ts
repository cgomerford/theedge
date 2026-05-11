import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  
  return NextResponse.json({
    secret_exists: !!secret,
    secret_length: secret?.length ?? 0,
    secret_first_4: secret?.substring(0, 4) ?? 'none',
    secret_last_4: secret?.substring(secret.length - 4) ?? 'none',
    auth_header_received: request.headers.get('authorization')?.substring(0, 20) ?? 'none',
  })
}