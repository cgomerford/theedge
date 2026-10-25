import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Default share image for every page: our own wordmark on the site's cream and orange. No MLB art.
export const alt = 'x9Lab: MLB game previews in plain numbers'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const font = await readFile(join(process.cwd(), 'src/lib/postgame/cards/fonts/RedHatDisplay-800.ttf'))
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 80, background: '#FAF8F3', color: '#1A1A1A', fontFamily: 'Red Hat Display' }}>
        <div style={{ display: 'flex', fontSize: 120, fontWeight: 800, letterSpacing: -3 }}>
          x9Lab<span style={{ color: '#FF5722' }}>.</span>
        </div>
        <div style={{ display: 'flex', fontSize: 44, fontWeight: 800, marginTop: 16 }}>MLB game previews in plain numbers</div>
      </div>
    ),
    { ...size, fonts: [{ name: 'Red Hat Display', data: font, weight: 800, style: 'normal' }] },
  )
}
