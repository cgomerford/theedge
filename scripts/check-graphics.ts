/**
 * Acceptance checks for /admin/graphics that need a running server (the DOM checks —
 * overflow at both sizes and export dimensions — were run in a real browser; see the PR notes).
 * Usage: npx tsx scripts/check-graphics.ts [baseUrl]   (reads ADMIN_USER / ADMIN_PASSWORD from the env)
 */
const base = process.argv[2] ?? 'http://localhost:3000'
const user = process.env.ADMIN_USER
const pass = process.env.ADMIN_PASSWORD

async function main() {
  const failures: string[] = []
  const anon = await fetch(`${base}/admin/graphics`)
  if (anon.status !== 401) failures.push(`without credentials expected 401, got ${anon.status}`)
  if (!user || !pass) { failures.push('ADMIN_USER / ADMIN_PASSWORD not set; skipped the authenticated check') } else {
    const authed = await fetch(`${base}/admin/graphics`, { headers: { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` } })
    if (authed.status !== 200) failures.push(`with credentials expected 200, got ${authed.status}`)
    const html = await authed.text()
    if (html.includes('<img')) failures.push('page HTML contains <img')
    const urls = (html.match(/https?:\/\/[^"'\\\s<)]+/g) ?? []).filter(u => !u.startsWith('http://www.w3.org/') && !u.startsWith('https://www.googletagmanager.com/'))  // sitewide analytics tag from the root layout, not graphics content
    if (urls.length) failures.push(`page HTML contains external URLs: ${[...new Set(urls)].slice(0, 5).join(', ')}`)
  }
  if (failures.length) { console.error('[check-graphics] FAIL\n- ' + failures.join('\n- ')); process.exit(1) }
  console.log('[check-graphics] ok: 401 without credentials, 200 with, no <img, no external URLs')
}
void main()
