import { getCurrentSubscriber } from '@/lib/auth'
import { redirect } from 'next/navigation'

/**
 * Require the current user to be an admin.
 * - Not logged in → redirect to /login
 * - Logged in but not admin → redirect to /dugout (looks like a normal user landing page)
 * - Admin → returns the AuthSubscriber for use in the page
 */
export async function requireAdmin() {
  const subscriber = await getCurrentSubscriber()

  if (!subscriber) {
    redirect('/login?from=/admin')
  }

  if (subscriber.role !== 'admin') {
    // Quiet redirect — don't tell non-admins the page exists
    redirect('/dugout')
  }

  return subscriber
}

/**
 * Soft check — returns boolean. Useful in shared components 
 * that conditionally show admin links.
 */
export async function isAdmin(): Promise<boolean> {
  const subscriber = await getCurrentSubscriber()
  return subscriber?.role === 'admin'
}