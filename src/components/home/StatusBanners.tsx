type Props = {
  checkEmail?: boolean
  alreadySubscribed?: boolean
  error?: string
}

const ERROR_COPY: Record<string, string> = {
  invalid: 'Enter a valid email address.',
  server: 'Something went wrong. Try again in a moment.',
  'verify-failed': 'Security check failed. Refresh and try again.',
  'rate-limit': 'Too many attempts. Wait a minute and try again.',
}

export default function StatusBanners({ checkEmail, alreadySubscribed, error }: Props) {
  if (!checkEmail && !alreadySubscribed && !error) return null

  return (
    <div className="border-b border-stone-200">
      {checkEmail && (
        <div className="bg-green-50 text-green-800 px-6 py-3 text-sm text-center">
          Check your inbox — click the link to verify and open your Dugout.
        </div>
      )}
      {alreadySubscribed && (
        <div className="bg-stone-100 text-stone-700 px-6 py-3 text-sm text-center">
          You&apos;re already subscribed.{' '}
          <a href="/login" className="underline font-medium hover:text-stone-900">
            Log in to your Dugout →
          </a>
        </div>
      )}
      {error && (
        <div className="bg-red-50 text-red-800 px-6 py-3 text-sm text-center">
          {ERROR_COPY[error] ?? 'Something went wrong. Please try again.'}
        </div>
      )}
    </div>
  )
}