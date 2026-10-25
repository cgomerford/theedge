// src/components/pitch-shape/pitchViewScene.ts
//
// The 3D pitch-over-the-years model on the Pitching Lab Shape tab (ported from mockups/pitch-view.html, approved).
// CLIENT ONLY: imports three and touches the DOM; PitchView.tsx is the only caller.
//
// Two tabs share one scene:
//   release  one dot per month at the recorded MEAN release point, on a 1-inch grid centred on the first month with
//            enough pitches
//   move     the pitch's path from release to the plate, drawn from the month's Statcast constant-acceleration terms
//            and anchored at the recorded plate crossing, next to the SAME pitch with no spin movement. The two are
//            `ivb` inches apart vertically and `hb` inches apart horizontally at the plate (brackets).
//
// Scene axes (1 unit = 1 ft): +x toward first base (catcher's view), +y up, -z toward the pitcher; the plate is at z = 0.
// Statcast axes: x same, z up, y = distance from the plate. So scene = (x, z_statcast, -y_statcast).
//
// "No spin" path = the thrown path minus the spin-induced part, which grows with time squared:
//   ref(t) = at(t) - ((t/T)^2) * (armSideSign * hb/12, ivb/12)      (arm side is +x for a left-hander, -x for a right-hander)
// so it ends exactly `hb`/`ivb` inches from where the pitch crosses the plate, using the same numbers the page prints.
// `exaggerate` only stretches the on-screen gap between the two paths; labels and tables always show true size.

import * as THREE from 'three'
import type { PitchViewMonth } from '@/lib/pitch-shape/model'

export type Tab = 'release' | 'move'
export type CamName = 'Catcher view' | 'Side' | 'Top' | 'Behind the mound' | 'Lane' | 'Plate end' | ''

export const MIN_N = 50 // months under this are drawn faint and left out of the change figures (same gate as the rest of the lab)
export const PRESET_NAMES: Record<Tab, CamName[]> = {
  release: ['Catcher view', 'Side', 'Top', 'Behind the mound'],
  move: ['Lane', 'Plate end', 'Side', 'Top'],
}

type Preset = { az: number; el: number; dist: number; fov: number; tgt?: THREE.Vector3; spanH?: number; spanV?: number }
type MonthGeo = PitchViewMonth & {
  T: number
  at: (t: number) => THREE.Vector3
  ref: (t: number) => THREE.Vector3
  pts: THREE.Vector3[]
  refPts: THREE.Vector3[]
  rel: THREE.Vector3
}

export type SceneOptions = {
  canvas: HTMLCanvasElement
  labels: HTMLElement
  months: PitchViewMonth[]
  hand: 'L' | 'R'
  monthLabel: (m: number) => string
  /** index of the overall standout period (gold), or null */
  goldIndex: number | null
  onCamName: (name: CamName) => void
  onNote: (text: string) => void
}

export type SceneApi = {
  setTab: (t: Tab) => void
  setCam: (name: CamName, snap?: boolean) => void
  setSel: (i: number) => void
  setAll: (on: boolean) => void
  setExaggerate: (on: boolean) => void
  setPlaying: (on: boolean) => void
  setSpeed: (s: number) => void
  dispose: () => void
}

const ZP = -17 / 12 // front of the plate
const RUBBER_Y = 60.5
const INK = 0x1a1a1a
const OR = 0xff5722
const FONT = 'var(--font-redhat), system-ui, sans-serif'
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export function monthColor(i: number, n: number): THREE.Color {
  return new THREE.Color('#c4b9a0').lerp(new THREE.Color('#FF5722'), n > 1 ? i / (n - 1) : 1)
}

/** Time (s from y = 50 ft) at which the Statcast path reaches distance y from the plate. */
function timeAt(vy: number, ay: number, y: number): number {
  const a = 0.5 * ay, b = vy, c = 50 - y
  return (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a)
}

export function buildGeo(months: PitchViewMonth[], hand: 'L' | 'R'): MonthGeo[] {
  const S = hand === 'L' ? 1 : -1
  return months.map(r => {
    const tp = timeAt(r.vy0, r.ay, -ZP), tr = timeAt(r.vy0, r.ay, r.releaseY)
    const x50 = r.plateX - r.vx0 * tp - 0.5 * r.ax * tp * tp
    const z50 = r.plateZ - r.vz0 * tp - 0.5 * r.az * tp * tp
    const T = tp - tr
    const at = (t: number) => {
      const u = tr + t
      return V3(x50 + r.vx0 * u + 0.5 * r.ax * u * u, z50 + r.vz0 * u + 0.5 * r.az * u * u, -(50 + r.vy0 * u + 0.5 * r.ay * u * u))
    }
    const ref = (t: number) => {
      const k = (t / T) ** 2, a = at(t)
      return V3(a.x - (S * r.hb) / 12 * k, a.y - (r.ivb / 12) * k, a.z)
    }
    const pts = Array.from({ length: 61 }, (_, j) => at((T * j) / 60))
    const refPts = Array.from({ length: 61 }, (_, j) => ref((T * j) / 60))
    return { ...r, T, at, ref, pts, refPts, rel: V3(r.releaseX, r.releaseZ, -r.releaseY) }
  })
}

function lineOf(pts: THREE.Vector3[], color: number, opacity = 1, dash?: number): THREE.Line {
  const g = new THREE.BufferGeometry().setFromPoints(pts)
  const m = dash
    ? new THREE.LineDashedMaterial({ color, dashSize: dash, gapSize: dash * 0.7, transparent: true, opacity })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity })
  const l = new THREE.Line(g, m)
  if (dash) l.computeLineDistances()
  return l
}

export function createPitchViewScene(opt: SceneOptions): SceneApi {
  const { canvas, labels, hand } = opt
  const M = buildGeo(opt.months, hand)
  const nM = M.length
  const S = hand === 'L' ? 1 : -1
  const full = M.map((_, i) => i).filter(i => M[i].n >= MIN_N)
  const baseI = full.length ? full[0] : 0
  const lastI = full.length ? full[full.length - 1] : nM - 1

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xfaf8f3)

  // ---------- the lane: ground grid, mound, rubber, plate, strike zone ----------
  const laneG = new THREE.Group()
  scene.add(laneG)
  {
    const g: THREE.Vector3[] = []
    for (let x = -6; x <= 6; x += 2) g.push(V3(x, 0, -66), V3(x, 0, 2))
    for (let z = -66; z <= 2; z += 6) g.push(V3(-6, 0, z), V3(6, 0, z))
    laneG.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(g), new THREE.LineBasicMaterial({ color: 0xd9d2c1 })))
    const mound = new THREE.Mesh(
      new THREE.LatheGeometry([[0, 0.83], [6.5, 0.83], [9, 0.02]].map(([x, y]) => new THREE.Vector2(x, y)), 40),
      new THREE.MeshBasicMaterial({ color: 0xece4d2 }),
    )
    mound.position.z = -59.5
    laneG.add(mound)
    const rub = new THREE.Mesh(new THREE.BoxGeometry(2, 0.12, 0.5), new THREE.MeshBasicMaterial({ color: INK }))
    rub.position.set(0, 0.9, -RUBBER_Y)
    laneG.add(rub)
    const sh = new THREE.Shape()
    sh.moveTo(-0.708, 0); sh.lineTo(0.708, 0); sh.lineTo(0.708, -0.708); sh.lineTo(0, -1.417); sh.lineTo(-0.708, -0.708); sh.closePath()
    const plate = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }))
    plate.rotation.x = -Math.PI / 2
    plate.position.y = 0.02
    laneG.add(plate)
    const w = 17 / 12 + 2.9 / 12
    const zt = M.reduce((a, r) => a + r.szTop, 0) / nM, zb = M.reduce((a, r) => a + r.szBot, 0) / nM
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, zt - zb, 17 / 12)), new THREE.LineBasicMaterial({ color: 0x6b6558 }))
    e.position.set(0, (zt + zb) / 2, -17 / 24)
    laneG.add(e)
    const gp: THREE.Vector3[] = []
    for (let i = 1; i < 3; i++) gp.push(V3(-w / 2 + (w * i) / 3, zb, ZP), V3(-w / 2 + (w * i) / 3, zt, ZP), V3(-w / 2, zb + ((zt - zb) * i) / 3, ZP), V3(w / 2, zb + ((zt - zb) * i) / 3, ZP))
    laneG.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gp), new THREE.LineBasicMaterial({ color: 0xd2cab8 })))
  }
  const relG = new THREE.Group(), movG = new THREE.Group()
  scene.add(relG, movG)

  // ---------- release tab ----------
  const O = M[baseI].rel.clone()
  {
    const gl: THREE.Vector3[] = [], R = 5 / 12 // three crossing grid planes through the origin, 1 in apart, +/-5 in
    for (let k = -5; k <= 5; k++) {
      const d = k / 12
      gl.push(V3(O.x + d, O.y - R, O.z), V3(O.x + d, O.y + R, O.z), V3(O.x - R, O.y + d, O.z), V3(O.x + R, O.y + d, O.z))
      gl.push(V3(O.x, O.y + d, O.z - R), V3(O.x, O.y + d, O.z + R), V3(O.x, O.y - R, O.z + d), V3(O.x, O.y + R, O.z + d))
      gl.push(V3(O.x + d, O.y, O.z - R), V3(O.x + d, O.y, O.z + R), V3(O.x - R, O.y, O.z + d), V3(O.x + R, O.y, O.z + d))
    }
    relG.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gl), new THREE.LineBasicMaterial({ color: 0xcfc7b3, transparent: true, opacity: 0.55 })))
    const ax = [V3(O.x - R, O.y, O.z), V3(O.x + R, O.y, O.z), V3(O.x, O.y - R, O.z), V3(O.x, O.y + R, O.z), V3(O.x, O.y, O.z - R), V3(O.x, O.y, O.z + R)]
    relG.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ax), new THREE.LineBasicMaterial({ color: 0x8a8275 })))
  }
  const dots = M.map((r, i) => {
    const small = r.n < MIN_N
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.022, 20, 14), new THREE.MeshBasicMaterial({ color: monthColor(i, nM), transparent: true, opacity: small ? 0.5 : 1 }))
    m.position.copy(r.rel)
    relG.add(m)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.036, 32), new THREE.MeshBasicMaterial({ color: INK, side: THREE.DoubleSide }))
    ring.position.copy(r.rel)
    ring.visible = false
    relG.add(ring)
    return { m, ring }
  })
  if (full.length > 1) relG.add(lineOf(full.map(i => M[i].rel), 0x6b6558, 0.8))

  // ---------- state ----------
  let tab: Tab = 'release', sel = lastI, allOn = false, ex = 1, speed = 1, playing = true, clock = 0
  let camName: CamName = 'Catcher view'
  const PRESETS: Record<Tab, Partial<Record<CamName, Preset>>> = {
    release: {
      'Catcher view': { az: 0, el: 0, dist: 2.3, fov: 22 },
      Side: { az: -90, el: 0, dist: 2.3, fov: 22 },
      Top: { az: 0, el: 89, dist: 2.3, fov: 22 },
      'Behind the mound': { az: 180, el: 0, dist: 2.3, fov: 22 },
    },
    move: {
      Lane: { az: 12, el: 9, dist: 70, fov: 28, tgt: V3(0, 3.5, -30) },
      'Plate end': { az: 0, el: 3, dist: 9, fov: 24, tgt: V3(0, 2.6, -1.4) },
      Side: { az: -90, el: 2, dist: 80, fov: 26, spanH: 68, tgt: V3(0, 3.5, -30) },
      Top: { az: 0, el: 89, dist: 85, fov: 26, spanV: 68, tgt: V3(0, 0, -30) },
    },
  }
  const camera = new THREE.PerspectiveCamera(30, 16 / 10, 0.02, 400)
  const view = { tgt: V3(0, 0, 0), az: 0, el: 0, dist: 10, fov: 30 }
  const goal = { tgt: V3(0, 0, 0), az: 0, el: 0, dist: 10, fov: 30 }

  const visAt = (r: MonthGeo, t: number) => { const a = r.at(t), q = r.ref(t); return q.clone().add(a.sub(q).multiplyScalar(ex)) }
  const vpts = (r: MonthGeo) => r.pts.map((p, j) => r.refPts[j].clone().add(p.clone().sub(r.refPts[j]).multiplyScalar(ex)))

  // ---------- move tab ----------
  type Dim = { q: THREE.Vector3; c: THREE.Vector3; a: THREE.Vector3 }
  const trailBall = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: OR }))
  const refBall = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0x6b6558 }))
  movG.add(trailBall, refBall)
  let movObjs: THREE.Object3D[] = []
  let dim: Dim | null = null
  const disposeObj = (o: THREE.Object3D) => {
    const m = o as THREE.Mesh
    m.geometry?.dispose()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose()
  }
  function buildMove() {
    movObjs.forEach(o => { movG.remove(o); disposeObj(o) })
    movObjs = []
    const add = <T extends THREE.Object3D>(o: T): T => { movG.add(o); movObjs.push(o); return o }
    M.forEach((r, i) => {
      if (i === sel || !allOn) return
      add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vpts(r)), 60, 0.035, 6), new THREE.MeshBasicMaterial({ color: monthColor(i, nM), transparent: true, opacity: 0.55 })))
    })
    const r = M[sel]
    add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vpts(r)), 80, 0.07, 8), new THREE.MeshBasicMaterial({ color: OR })))
    add(lineOf(r.refPts, 0x6b6558, 1, 0.9))
    const a = visAt(r, r.T), q = r.ref(r.T), c = V3(a.x, q.y, a.z)
    add(lineOf([q, c], INK, 1))
    add(lineOf([c, a], INK, 1))
    for (const [p, v] of [[q, 0x6b6558], [a, OR]] as const) {
      const m = add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshBasicMaterial({ color: v })))
      m.position.copy(p)
    }
    const rl = add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), new THREE.MeshBasicMaterial({ color: INK })))
    rl.position.copy(r.at(0))
    dim = { q, c, a }
  }

  // ---------- camera ----------
  function setCam(name: CamName, snap = false) {
    const p = PRESETS[tab][name]
    if (!p) return
    camName = name
    const asp = canvas.clientWidth / (canvas.clientHeight || 1) || 1.6
    goal.az = p.az; goal.el = p.el; goal.fov = p.fov
    goal.dist = p.spanH ? p.spanH / (2 * Math.tan((p.fov * Math.PI) / 360) * asp) : p.spanV ? p.spanV / (2 * Math.tan((p.fov * Math.PI) / 360)) : p.dist
    goal.tgt = (p.tgt ?? (tab === 'release' ? O : V3(0, 3, -30))).clone()
    if (snap) { view.az = goal.az; view.el = goal.el; view.dist = goal.dist; view.fov = goal.fov; view.tgt.copy(goal.tgt) }
    opt.onCamName(name)
  }
  let drag: [number, number] | null = null
  const onDown = (e: PointerEvent) => { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing' }
  const onUp = () => { drag = null; canvas.style.cursor = 'grab' }
  const onMove = (e: PointerEvent) => {
    if (!drag) return
    goal.az -= (e.clientX - drag[0]) * 0.3
    goal.el = Math.max(-5, Math.min(89, goal.el + (e.clientY - drag[1]) * 0.3))
    drag = [e.clientX, e.clientY]
    if (camName !== '') { camName = ''; opt.onCamName('') }
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointermove', onMove)
  canvas.style.cursor = 'grab'
  canvas.style.touchAction = 'pan-y' // vertical swipes still scroll the page; horizontal drags orbit

  // ---------- labels (plain DOM, positioned each frame) ----------
  const mkLabel = (kind: 'pill' | 'or' | 'tick') => {
    const d = document.createElement('div')
    const base = `position:absolute;transform:translate(-50%,-50%);font:600 ${kind === 'tick' ? 10 : 11}px ${FONT};pointer-events:none;white-space:nowrap;display:none;`
    d.style.cssText = base + (kind === 'pill' ? 'background:#1A1A1A;color:#FAF8F3;border-radius:999px;padding:1px 7px;font-size:10px;'
      : kind === 'or' ? 'background:#FF5722;color:#fff;border-radius:999px;padding:2px 9px;' : 'color:#8a8275;')
    labels.appendChild(d)
    return d
  }
  const monthLbl = M.map(() => mkLabel('pill'))
  const Lhb = mkLabel('pill'), Livb = mkLabel('pill'), Lref = mkLabel('pill'), Lact = mkLabel('or')
  const gx0 = mkLabel('tick'), gx1 = mkLabel('tick'), gy1 = mkLabel('tick')
  const allTicks = [gx0, gx1, gy1]
  const hide = (...els: HTMLElement[]) => els.forEach(e => { e.style.display = 'none' })
  const proj = (el: HTMLElement, p: THREE.Vector3, txt: string | null, show = true) => {
    const v = p.clone().project(camera)
    const ok = show && v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05
    el.style.display = ok ? 'block' : 'none'
    if (!ok) return
    if (txt != null) el.textContent = txt
    el.style.left = `${(v.x * 0.5 + 0.5) * canvas.clientWidth}px`
    el.style.top = `${(-v.y * 0.5 + 0.5) * canvas.clientHeight}px`
  }

  // ---------- loop ----------
  let last = performance.now() / 1000
  function frame(now: number) {
    const dt = Math.min(0.05, now - last); last = now
    const k = 1 - Math.pow(0.0005, dt)
    view.az += (goal.az - view.az) * k; view.el += (goal.el - view.el) * k; view.dist += (goal.dist - view.dist) * k; view.fov += (goal.fov - view.fov) * k
    view.tgt.lerp(goal.tgt, k)
    const az = (view.az * Math.PI) / 180, el = (view.el * Math.PI) / 180
    camera.position.set(view.tgt.x + view.dist * Math.sin(az) * Math.cos(el), view.tgt.y + view.dist * Math.sin(el), view.tgt.z + view.dist * Math.cos(az) * Math.cos(el))
    camera.up.set(0, el > 1.4 ? 0 : 1, el > 1.4 ? -1 : 0)
    camera.lookAt(view.tgt)
    camera.fov = view.fov
    const w = canvas.clientWidth, h = canvas.clientHeight
    if (w === 0 || h === 0) return
    if (canvas.width !== Math.round(w * renderer.getPixelRatio())) renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    const pxFt = (p: THREE.Vector3) => h / (2 * camera.position.distanceTo(p) * Math.tan((camera.fov * Math.PI) / 360))

    if (tab === 'release') {
      dots.forEach((d, i) => {
        d.ring.visible = i === sel
        d.m.scale.setScalar(i === sel ? 1.35 : 1)
        proj(monthLbl[i], M[i].rel.clone().add(V3(0, (i % 2 ? -1 : 1) * 0.06, 0)), (i === opt.goldIndex ? '' : '') + opt.monthLabel(M[i].month), true)
        if (i === opt.goldIndex) { monthLbl[i].style.background = '#F5B800'; monthLbl[i].style.color = '#1A1A1A' }
        monthLbl[i].style.opacity = i === sel ? '1' : '0.8'
      })
      hide(Lhb, Livb, Lref, Lact)
      const R = 5 / 12, onCatcher = camName === 'Catcher view'
      proj(gx0, V3(O.x - R, O.y - R - 0.03, O.z), '−5 in', onCatcher)
      proj(gx1, V3(O.x + R, O.y - R - 0.03, O.z), '+5 in', onCatcher)
      proj(gy1, V3(O.x - R - 0.06, O.y + R, O.z), '+5 in', onCatcher)
    } else {
      hide(...allTicks, ...monthLbl)
      const r = M[sel]
      if (playing) clock += dt * speed
      const cyc = r.T + 0.7, t = Math.min(clock % cyc, r.T)
      const a = visAt(r, t), q = r.ref(t)
      trailBall.position.copy(a); trailBall.scale.setScalar(Math.max(2.9 / 24, 5 / pxFt(a)))
      refBall.position.copy(q); refBall.scale.setScalar(Math.max(2.9 / 24, 4 / pxFt(q)))
      if (dim) {
        const near = camName === 'Plate end' || ex > 1 || camName === ''
        proj(Lhb, dim.q.clone().lerp(dim.c, 0.5), `${Math.abs(r.hb).toFixed(1)} in across`, near)
        proj(Livb, dim.c.clone().lerp(dim.a, 0.5), `${Math.abs(r.ivb).toFixed(1)} in ${r.ivb >= 0 ? 'up' : 'down'}`, near)
        proj(Lref, dim.q, 'no spin', near)
        const isGold = sel === opt.goldIndex
        Lact.style.background = isGold ? '#F5B800' : '#FF5722'
        Lact.style.color = isGold ? '#1A1A1A' : '#fff'
        proj(Lact, dim.a, `${isGold ? '' : ''}${opt.monthLabel(r.month)} · ${r.speed.toFixed(1)} mph`, near)
      }
    }
    renderer.render(scene, camera)
  }
  renderer.setAnimationLoop(t => frame(t / 1000))

  const api: SceneApi = {
    setTab(t) {
      tab = t
      relG.visible = t === 'release'
      movG.visible = t === 'move'
      ex = 1
      if (t === 'move') { buildMove(); clock = 0 }
      hide(...allTicks, Lhb, Livb, Lref, Lact, ...monthLbl)
      setCam(t === 'release' ? 'Catcher view' : 'Lane', true)
      opt.onNote('')
    },
    setCam,
    setSel(i) { sel = Math.max(0, Math.min(nM - 1, i)); if (tab === 'move') { buildMove(); clock = 0 } },
    setAll(on) { allOn = on; if (tab === 'move') buildMove() },
    setExaggerate(on) {
      ex = on ? 4 : 1
      if (tab === 'move') buildMove()
      opt.onNote(on ? 'Break drawn 4× larger than real so it can be seen. The numbers are true size.' : '')
    },
    setPlaying(on) { playing = on },
    setSpeed(s) { speed = s },
    dispose() {
      renderer.setAnimationLoop(null)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointermove', onMove)
      scene.traverse(disposeObj)
      renderer.dispose()
      labels.replaceChildren()
    },
  }
  api.setTab('release')
  return api
}
