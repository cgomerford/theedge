import { createBrowserClient } from '@supabase/ssr'
import { createClient as createBaseClient } from '@supabase/supabase-js'

// Used in the browser (signup forms, client components)
// Uses the public anon key — safe to expose
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Used in server-side code only (API routes, server components)
// Uses the secret service-role key — NEVER use in browser code
export function createAdminClient() {
  return createBaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}