// src/components/admin/story-v5/mp4check.ts
//
// Pure MP4 inspection, no ffmpeg needed: reads the boxes and reports what the video spec cares about, and can move `moov` in front of
// `mdat` ("faststart", so it plays before it has fully downloaded).
// Spec: H.264, yuv420p, 1080x1350, 30 fps, no audio track, moov before mdat, and the frame count / length the chosen slides add up to.

export type Mp4Report = {
  hasFtyp: boolean; faststart: boolean
  videoTracks: number; audioTracks: number
  codec: string | null; profileIdc: number | null; chroma420: boolean | null
  width: number | null; height: number | null
  frames: number | null; fps: number | null; seconds: number | null
}
export type SpecIssue = string

type Box = { type: string; start: number; size: number; body: number }

function boxes(v: DataView, from: number, to: number): Box[] {
  const out: Box[] = []
  let p = from
  while (p + 8 <= to) {
    let size = v.getUint32(p), hdr = 8
    const type = String.fromCharCode(v.getUint8(p + 4), v.getUint8(p + 5), v.getUint8(p + 6), v.getUint8(p + 7))
    if (size === 1) { size = Number(v.getBigUint64(p + 8)); hdr = 16 } else if (size === 0) size = to - p
    if (size < hdr || p + size > to) break
    out.push({ type, start: p, size, body: p + hdr })
    p += size
  }
  return out
}
const child = (v: DataView, b: Box, type: string) => boxes(v, b.body, b.start + b.size).find(x => x.type === type)
const children = (v: DataView, b: Box, type: string) => boxes(v, b.body, b.start + b.size).filter(x => x.type === type)
const HIGH_PROFILES = new Set([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135])

export function inspectMp4(buf: Uint8Array): Mp4Report {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const top = boxes(v, 0, buf.byteLength)
  const moov = top.find(b => b.type === 'moov'), mdatAt = top.findIndex(b => b.type === 'mdat'), moovAt = top.findIndex(b => b.type === 'moov')
  const r: Mp4Report = {
    hasFtyp: top.some(b => b.type === 'ftyp'), faststart: moovAt >= 0 && mdatAt >= 0 && moovAt < mdatAt,
    videoTracks: 0, audioTracks: 0, codec: null, profileIdc: null, chroma420: null, width: null, height: null, frames: null, fps: null, seconds: null,
  }
  if (!moov) return r
  for (const trak of children(v, moov, 'trak')) {
    const mdia = child(v, trak, 'mdia'); if (!mdia) continue
    const hdlr = child(v, mdia, 'hdlr')
    const kind = hdlr ? String.fromCharCode(v.getUint8(hdlr.body + 8), v.getUint8(hdlr.body + 9), v.getUint8(hdlr.body + 10), v.getUint8(hdlr.body + 11)) : ''
    if (kind === 'soun') { r.audioTracks++; continue }
    if (kind !== 'vide') continue
    r.videoTracks++
    const tkhd = child(v, trak, 'tkhd')
    if (tkhd) { const o = tkhd.body + (v.getUint8(tkhd.body) === 1 ? 88 : 76); r.width = Math.round(v.getUint32(o) / 65536); r.height = Math.round(v.getUint32(o + 4) / 65536) }
    const mdhd = child(v, mdia, 'mdhd')
    let timescale = 0, duration = 0
    if (mdhd) { const ver = v.getUint8(mdhd.body); timescale = v.getUint32(mdhd.body + (ver === 1 ? 20 : 12)); duration = ver === 1 ? Number(v.getBigUint64(mdhd.body + 24)) : v.getUint32(mdhd.body + 16) }
    const stbl = child(v, child(v, mdia, 'minf') ?? mdia, 'stbl'); if (!stbl) continue
    const stts = child(v, stbl, 'stts')
    if (stts) { const n = v.getUint32(stts.body + 4); let frames = 0; for (let i = 0; i < n; i++) frames += v.getUint32(stts.body + 8 + i * 8); r.frames = frames }
    r.seconds = timescale ? duration / timescale : null
    r.fps = r.frames != null && r.seconds ? Math.round((r.frames / r.seconds) * 100) / 100 : null
    const stsd = child(v, stbl, 'stsd')
    if (stsd) {
      const entry = boxes(v, stsd.body + 8, stsd.start + stsd.size)[0]
      if (entry) {
        r.codec = entry.type
        const avcC = boxes(v, entry.body + 78, entry.start + entry.size).find(b => b.type === 'avcC')
        if (avcC) {
          const profile = v.getUint8(avcC.body + 1)
          r.profileIdc = profile
          if (!HIGH_PROFILES.has(profile)) r.chroma420 = true
          else {
            let o = avcC.body + 5
            const nSps = v.getUint8(o) & 31; o++
            for (let i = 0; i < nSps; i++) o += 2 + v.getUint16(o)
            const nPps = v.getUint8(o); o++
            for (let i = 0; i < nPps; i++) o += 2 + v.getUint16(o)
            r.chroma420 = o < avcC.start + avcC.size ? (v.getUint8(o) & 3) === 1 : null
          }
        }
      }
    }
  }
  return r
}

/** What the render must satisfy. Returns the problems; an empty list means the video meets the spec. */
export function specIssues(r: Mp4Report, expect: { width: number; height: number; fps: number; frames: number }): SpecIssue[] {
  const p: SpecIssue[] = []
  if (!r.hasFtyp) p.push('not an MP4 (no ftyp box)')
  if (r.videoTracks !== 1) p.push(`expected 1 video track, found ${r.videoTracks}`)
  if (r.audioTracks > 0) p.push(`has ${r.audioTracks} audio track(s), expected none`)
  if (r.codec !== 'avc1') p.push(`codec is ${r.codec ?? 'unknown'}, expected H.264 (avc1)`)
  if (r.chroma420 !== true) p.push(r.chroma420 === false ? 'pixel format is not yuv420p' : 'could not confirm yuv420p')
  if (r.width !== expect.width || r.height !== expect.height) p.push(`size is ${r.width}x${r.height}, expected ${expect.width}x${expect.height}`)
  if (r.fps == null || Math.abs(r.fps - expect.fps) > 0.05) p.push(`frame rate is ${r.fps}, expected ${expect.fps}`)
  if (r.frames !== expect.frames) p.push(`has ${r.frames} frames, expected ${expect.frames}`)
  if (!r.faststart) p.push('moov is after mdat (not faststart)')
  return p
}

/** Move moov in front of mdat. Chunk offsets (stco / co64) shift by the size of moov. Returns the input untouched if it is already faststart. */
export function makeFaststart(buf: Uint8Array): Uint8Array {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const top = boxes(v, 0, buf.byteLength)
  const moovAt = top.findIndex(b => b.type === 'moov'), mdatAt = top.findIndex(b => b.type === 'mdat')
  if (moovAt < 0 || mdatAt < 0 || moovAt < mdatAt) return buf
  const moov = top[moovAt]
  const moovBytes = buf.slice(moov.start, moov.start + moov.size)
  const mv = new DataView(moovBytes.buffer)
  const walk = (b: Box) => {
    for (const c of boxes(mv, b.body, b.start + b.size)) {
      if (c.type === 'stco') { const n = mv.getUint32(c.body + 4); for (let i = 0; i < n; i++) { const o = c.body + 8 + i * 4; mv.setUint32(o, mv.getUint32(o) + moov.size) } }
      else if (c.type === 'co64') { const n = mv.getUint32(c.body + 4); for (let i = 0; i < n; i++) { const o = c.body + 8 + i * 8; mv.setBigUint64(o, mv.getBigUint64(o) + BigInt(moov.size)) } }
      else if (['trak', 'mdia', 'minf', 'stbl', 'edts'].includes(c.type)) walk(c)
    }
  }
  walk({ type: 'moov', start: 0, size: moovBytes.byteLength, body: 8 })
  const ftyp = top.filter((_, i) => i < moovAt && top[i].type === 'ftyp')
  const rest = top.filter((b, i) => i !== moovAt && b.type !== 'ftyp')
  const parts = [...ftyp.map(b => buf.slice(b.start, b.start + b.size)), moovBytes, ...rest.map(b => buf.slice(b.start, b.start + b.size))]
  const out = new Uint8Array(parts.reduce((a, p) => a + p.byteLength, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.byteLength }
  return out
}
