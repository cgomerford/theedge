import { describe, expect, it } from 'vitest'
import { inspectMp4, makeFaststart, specIssues } from './mp4check'

// A tiny hand-built MP4 (no real video): enough boxes for the checker to read, with a known payload so chunk offsets can be proven.
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const u16 = (n: number) => [(n >> 8) & 255, n & 255]
const str = (s: string) => [...s].map(c => c.charCodeAt(0))
const box = (type: string, ...parts: number[][]) => { const body = parts.flat(); return [...u32(8 + body.length), ...str(type), ...body] }
const zeros = (n: number) => new Array(n).fill(0)

function build(opts: { faststart: boolean; audio?: boolean; high?: boolean; w?: number; h?: number; frames?: number }) {
  const { w = 1080, h = 1350, frames = 715 } = opts
  const payload = str('PAYLOADBYTES')
  const mdat = box('mdat', payload)
  const ftyp = box('ftyp', str('isom'), u32(512), str('isomavc1'))
  const sps = [0x67, 0x64, 0x00, 0x28], pps = [0x68, 0xee]
  const avcC = box('avcC', [1, opts.high === false ? 77 : 100, 0, 40, 0xff, 0xe1], u16(sps.length), sps, [1], u16(pps.length), pps, ...(opts.high === false ? [] : [[0xfd, 0xf8, 0xf8, 0]]))
  const avc1 = box('avc1', zeros(6), u16(1), zeros(16), u16(w), u16(h), u32(0x480000), u32(0x480000), zeros(4), u16(1), zeros(32), u16(24), [0xff, 0xff], avcC)
  const trak = (kind: string, ofs: number) => box('trak',
    box('tkhd', [0, 0, 0, 7], zeros(72), u32(w * 65536), u32(h * 65536)),
    box('mdia', box('mdhd', zeros(4), zeros(4), zeros(4), u32(30), u32(frames), zeros(4)), box('hdlr', zeros(4), zeros(4), str(kind), zeros(12)),
      box('minf', box('stbl', box('stsd', zeros(4), u32(1), avc1), box('stts', zeros(4), u32(1), u32(frames), u32(1)), box('stco', zeros(4), u32(1), u32(ofs))))))
  const make = (ofs: number) => box('moov', box('mvhd', zeros(100)), trak('vide', ofs), ...(opts.audio ? [trak('soun', ofs)] : []))
  const moovSize = make(0).length
  if (opts.faststart) { const ofs = ftyp.length + moovSize + 8; return { bytes: new Uint8Array([...ftyp, ...make(ofs), ...mdat]), ofs } }
  const ofs = ftyp.length + 8; return { bytes: new Uint8Array([...ftyp, ...mdat, ...make(ofs)]), ofs }
}
const readAt = (b: Uint8Array, at: number) => String.fromCharCode(...b.slice(at, at + 12))

describe('inspectMp4', () => {
  it('reads codec, size, frame count, fps, audio and faststart', () => {
    const r = inspectMp4(build({ faststart: true }).bytes)
    expect(r).toMatchObject({ hasFtyp: true, faststart: true, videoTracks: 1, audioTracks: 0, codec: 'avc1', profileIdc: 100, chroma420: true, width: 1080, height: 1350, frames: 715 })
    expect(r.fps).toBe(30); expect(r.seconds).toBeCloseTo(715 / 30, 3)
  })
  it('flags what the spec forbids', () => {
    const spec = { width: 1080, height: 1350, fps: 30, frames: 715 }
    expect(specIssues(inspectMp4(build({ faststart: true }).bytes), spec)).toEqual([])
    const bad = specIssues(inspectMp4(build({ faststart: false, audio: true, w: 1920, h: 1080, frames: 900 }).bytes), spec)
    expect(bad.join('|')).toMatch(/audio track/); expect(bad.join('|')).toMatch(/1920x1080/); expect(bad.join('|')).toMatch(/900 frames/); expect(bad.join('|')).toMatch(/not faststart/)
  })
})

describe('makeFaststart', () => {
  it('moves moov in front of mdat and keeps every chunk offset pointing at the same bytes', () => {
    const slow = build({ faststart: false })
    expect(readAt(slow.bytes, slow.ofs)).toBe('PAYLOADBYTES')
    const fast = makeFaststart(slow.bytes)
    const r = inspectMp4(fast)
    expect(r.faststart).toBe(true); expect(r.frames).toBe(715)
    // the stco entry was shifted by the moov size: find it and read the bytes it points at
    const v = new DataView(fast.buffer, fast.byteOffset, fast.byteLength)
    let at = -1
    for (let i = 0; i < fast.length - 4; i++) if (String.fromCharCode(...fast.slice(i, i + 4)) === 'stco') { at = i; break }
    const ofs = v.getUint32(at + 4 + 8)
    expect(readAt(fast, ofs)).toBe('PAYLOADBYTES')
  })
  it('leaves a faststart file alone', () => {
    const f = build({ faststart: true }).bytes
    expect(makeFaststart(f)).toBe(f)
  })
})
