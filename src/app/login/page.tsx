import SiteHeader from '@/components/SiteHeader'
import TurnstileWidget from '@/components/TurnstileWidget'

type Props = {
  searchParams: Promise<{ sent?: string; error?: string }>
}

export const metadata = {
  title: 'Sign in · The Edge',
}

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams
  const sent = sp.sent === '1'
  const error = sp.error

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <SiteHeader variant="page" />

      <div className="max-w-md mx-auto px-6 py-16 md:py-24">
        <div className="text-xs font-mono uppercase tracking-widest text-orange-600 mb-4">
          — Sign in
        </div>

        <h1 className="text-4xl md:text-5xl font-serif font-light tracking-tight mb-3">
          Welcome <em className="italic text-orange-600">back.</em>
        </h1>

        <p className="text-stone-600 font-serif italic mb-10 text-lg">
          Enter your email and we&apos;ll send a one-tap sign-in link.
        </p>

        {sent ? (
          <div className="p-6 bg-stone-900 text-stone-100 border-l-4 border-yellow-300">
            <div className="text-xs font-mono uppercase tracking-widest text-yellow-300 mb-2">
              ✓ Check your inbox
            </div>
            <p className="font-serif">
              We&apos;ve sent a sign-in link to your email. The link works once and expires in 30 minutes.
            </p>
            <p className="font-mono text-xs text-stone-500 mt-4">
              Don&apos;t see it? Check spam, then{' '}
              <a href="/login" className="text-yellow-300 underline">try again</a>.
            </p>
          </div>
        ) : (
          <form action="/api/auth/login" method="POST" className="space-y-4">
            <input
              name="email"
              type="email"
              required
              placeholder="you@example.com"
              className="w-full px-4 py-4 bg-white border border-stone-300 text-stone-900 outline-none focus:border-stone-900 font-serif text-lg"
            />

            <TurnstileWidget theme="light" />

            <button
              type="submit"
              className="w-full px-6 py-4 bg-stone-900 text-stone-100 font-semibold hover:bg-stone-800 transition"
            >
              Send sign-in link →
            </button>

            {error === 'rate-limit' && (
              <p className="text-red-700 text-sm font-mono">Too many attempts. Try again in a minute.</p>
            )}
            {error === 'invalid' && (
              <p className="text-red-700 text-sm font-mono">Please enter a valid email.</p>
            )}
            {error === 'invalid-or-expired' && (
              <p className="text-red-700 text-sm font-mono">That link has expired. Request a new one.</p>
            )}
            {error === 'missing' && (
              <p className="text-red-700 text-sm font-mono">Invalid sign-in link.</p>
            )}
            {error === 'verify-failed' && (
              <p className="text-red-700 text-sm font-mono">Browser check failed. Reload the page and try again.</p>
            )}
          </form>
        )}

        <div className="mt-12 pt-8 border-t border-stone-200 text-stone-500 font-serif text-sm">
          New to The Edge?{' '}
          <a href="/" className="text-orange-600 hover:underline">
            Sign up here →
          </a>
        </div>
      </div>
    </main>
  )
}