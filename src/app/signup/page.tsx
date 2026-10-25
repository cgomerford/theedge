import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import TurnstileWidget from '@/components/TurnstileWidget'
import { getCurrentSubscriber } from '@/lib/auth'
import { ATTRIBUTION_KEYS, readAttribution, safeReturnPath } from '@/lib/attribution'
import { noindex } from '@/lib/seo'

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const metadata = { title: 'Sign up', ...noindex() }

// Same-site path of the page that linked here, from the Referer header (used only when ?return_to= is absent).
async function refererPath(): Promise<string | undefined> {
  const h = await headers()
  const ref = h.get('referer')
  const host = h.get('host')
  if (!ref || !host) return undefined
  try {
    const u = new URL(ref)
    if (u.host !== host) return undefined
    return safeReturnPath(u.pathname + u.search)
  } catch {
    return undefined
  }
}

export default async function SignupPage({ searchParams }: Props) {
  const sp = await searchParams
  const first = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k])

  // Attribution rides in hidden fields only — no cookies, nothing stored in the browser.
  const attribution = readAttribution(first)
  const returnTo = attribution.return_to ?? (await refererPath())

  if (await getCurrentSubscriber()) redirect(returnTo ?? '/dugout')

  const sent = first('sent') === '1'
  const error = first('error')

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <SiteHeader variant="page" />

      <div className="max-w-md mx-auto px-6 py-16 md:py-24">
        <div className="text-xs uppercase tracking-widest text-orange-600 mb-4">— Sign up</div>

        <h1 className="text-4xl md:text-5xl font-light tracking-tight mb-3">
          Get the <em className="italic text-orange-600">full read.</em>
        </h1>

        <p className="text-stone-600 italic mb-10 text-lg">
          Enter your email and we&apos;ll send a one-tap link. No password.
        </p>

        {sent ? (
          <div className="p-6 bg-stone-900 text-stone-100 border-l-4 border-yellow-300">
            <div className="text-xs uppercase tracking-widest text-yellow-300 mb-2">Check your inbox</div>
            <p>
              If that email is on our list, a sign-in link is on its way. It works once and expires in 30
              minutes{returnTo ? ', and brings you back to where you were' : ''}.
            </p>
            <p className="text-xs text-stone-500 mt-4">
              Don&apos;t see it? Check spam, then{' '}
              <a href="/signup" className="text-yellow-300 underline">try again</a>.
            </p>
          </div>
        ) : (
          <form action="/api/auth/login" method="POST" className="space-y-4">
            <input type="hidden" name="from" value="signup" />
            {ATTRIBUTION_KEYS.map((k) =>
              attribution[k] ? <input key={k} type="hidden" name={k} value={attribution[k]} /> : null,
            )}
            {returnTo && <input type="hidden" name="return_to" value={returnTo} />}

            <input
              name="email"
              type="email"
              required
              placeholder="you@example.com"
              className="w-full px-4 py-4 bg-white border border-stone-300 text-stone-900 outline-none focus:border-stone-900 text-lg"
            />

            <TurnstileWidget theme="light" />

            <button
              type="submit"
              className="w-full px-6 py-4 bg-stone-900 text-stone-100 font-semibold hover:bg-stone-800 transition"
            >
              Send sign-in link →
            </button>

            {error === 'rate-limit' && <p className="text-red-700 text-sm">Too many attempts. Try again in a minute.</p>}
            {error === 'invalid' && <p className="text-red-700 text-sm">Please enter a valid email.</p>}
            {error === 'verify-failed' && (
              <p className="text-red-700 text-sm">Browser check failed. Reload the page and try again.</p>
            )}
          </form>
        )}

        <div className="mt-12 pt-8 border-t border-stone-200 text-stone-500 text-sm">
          Already have an account?{' '}
          <a href="/login" className="text-orange-600 hover:underline">Sign in →</a>
        </div>
      </div>
    </main>
  )
}
