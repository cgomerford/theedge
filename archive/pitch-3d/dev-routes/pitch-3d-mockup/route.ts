// Dev-only MOCKUP of the broadcast-style 3D pitch view for the Pitch Shape Lab. 404s in production. Not linked anywhere.
//   http://localhost:3000/dev/pitch-3d-mockup
// Everything numeric here is FAKE (four invented pitches) so the look can be judged before any Supabase table / cron / R3F build.
// Real: the pitcher (public/models/pitcher.glb, recorded motion). Stand-ins: park, catcher, umpire, batter (primitives, not final art).
// Units: 1 scene unit = 1 ft. Scene axes: +x toward first base (catcher's view), +y up, -z toward the pitcher; the back point of the plate is the origin.

export const dynamic = 'force-dynamic'

const PAGE = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pitch 3D Mockup</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Red+Hat+Display:wght@400;600;800&display=swap" rel="stylesheet">
<style>
:root{--cream:#FAF8F3;--ink:#1A1A1A;--orange:#FF5722;--line:#e7e2d8;--mute:#8a8275}
*{box-sizing:border-box}html,body{margin:0;background:var(--cream);color:var(--ink);font-family:'Red Hat Display',system-ui,sans-serif;font-variant-numeric:tabular-nums}
.wrap{max-width:1240px;margin:0 auto;padding:20px 16px}
h1{font-weight:800;font-size:28px;letter-spacing:-.01em;margin:0 0 4px}h1 b{color:var(--orange)}
.sub{color:var(--mute);font-size:13px;margin-bottom:14px}
#stage{position:relative;width:100%;aspect-ratio:16/9;max-height:76vh;background:#0c0f16;border-radius:14px;overflow:hidden}
@media(max-width:640px){#stage{aspect-ratio:4/5;max-height:none}}
canvas{width:100%;height:100%;display:block}
.tag{position:absolute;transform:translate(-50%,-100%);background:var(--cream);color:var(--ink);border-radius:999px;padding:3px 10px 3px 8px;font:600 12px 'Red Hat Display',sans-serif;display:none;white-space:nowrap;pointer-events:none;box-shadow:0 2px 8px #0006}
.tag i{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--orange);margin-right:6px}
#hud{position:absolute;left:14px;top:12px;color:var(--cream);opacity:0;transition:opacity .25s;pointer-events:none;text-shadow:0 1px 6px #000a}
#hud .t{font-weight:800;font-size:11px;letter-spacing:.14em;color:var(--orange);text-transform:uppercase}
#hud .n{font-weight:800;font-size:30px;line-height:1.05}#hud .n small{font-size:13px;font-weight:600;margin-left:4px;opacity:.85}
#hud .m{font-size:13px;font-weight:600;opacity:.9;margin-top:2px}
#hud .c{display:inline-block;margin-top:6px;font-size:11px;font-weight:600;border:1px solid #FAF8F366;border-radius:999px;padding:2px 9px}
#legend{position:absolute;right:12px;top:12px;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;max-width:50%}
#legend span{font:600 11px 'Red Hat Display';color:var(--cream);background:#0008;border-radius:999px;padding:2px 9px 2px 6px;display:none}
#legend span i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px}
#load{position:absolute;inset:0;display:grid;place-items:center;color:var(--cream);font-weight:600;font-size:14px}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}
.k{font-size:10px;letter-spacing:.14em;font-weight:800;color:var(--orange);text-transform:uppercase;margin:0 2px 0 8px}
button{font:600 13px 'Red Hat Display',sans-serif;border:0;background:var(--ink);border-radius:999px;padding:8px 15px;cursor:pointer;color:var(--cream)}
button.on{background:var(--orange);color:#fff}
.foot{font-size:11px;color:#a89e8c;margin-top:12px;line-height:1.5}
</style></head><body><div class="wrap">
<h1><b>⊕</b> Pitch view <span style="font-weight:600;color:var(--mute);font-size:16px">· 3D mockup</span></h1>
<div class="sub">Mockup with fake numbers. The pitcher is the real recorded motion; park, catcher, umpire and batter are stand-ins.</div>
<div id="stage"><canvas id="c"></canvas>
<div class="tag" id="tagP"><i></i>Okafor</div><div class="tag" id="tagB"><i></i>Brennan</div>
<div id="hud"><div class="t" id="hT">Four-seam fastball</div><div class="n" id="hV">—<small>mph</small></div><div class="m" id="hM"></div><div class="c">Illustrative path</div></div>
<div id="legend"></div><div id="load">Loading the ballpark…</div></div>
<div class="bar"><button id="play">Replay</button>
<span class="k">Speed</span><button data-sp="1" class="on">1×</button><button data-sp=".5">0.5×</button><button data-sp=".25">0.25×</button>
<span class="k">Camera</span><button data-cam="broadcast" class="on">Broadcast</button><button data-cam="catcher">Catcher</button><button data-cam="pitcher">Pitcher</button></div>
<div class="bar"><span class="k" style="margin-left:0">Month</span><span id="months"></span><button id="ghosts" class="on">Earlier months</button><button id="clear">Clear</button></div>
<div class="foot">Built on public game data. x9Lab is independent and not affiliated with MLB. · Keys: space = replay, 1 / 2 / 3 = cameras.</div>
</div>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
const $ = id => document.getElementById(id), V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const FT = 3.28084, REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const CREAM = 0xFAF8F3, INK = 0x1A1A1A, ORANGE = 0xFF5722;
try {
  const canvas = $('c'), renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15; renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0c0f16); scene.fog = new THREE.Fog(0x0c0f16, 420, 1100);
  const mat = (c, r = .85, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, ...extra });

  // ---------- lighting: night-game rig ----------
  scene.add(new THREE.HemisphereLight(0x20242c, 0x3a2d22, 2.2));
  const key = new THREE.DirectionalLight(0xfff2dc, 3.2); key.position.set(110, 120, -120); key.target.position.set(0, 0, -45); scene.add(key, key.target);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 10, far: 400 }); key.shadow.bias = -.0004; key.shadow.normalBias = .05;
  const fill = new THREE.DirectionalLight(0x9db4ff, .5); fill.position.set(-60, 50, 80); scene.add(fill);

  // ---------- park (generic "x9Lab Park"; regulation distances, plain colours, no logos) ----------
  const P = new THREE.Group(); scene.add(P);
  const stripes = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 512; const g = c.getContext('2d'); for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#2f6b3b' : '#2a6034'; g.fillRect(0, i * 32, 64, 32); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 14); return t; })();
  const grass = new THREE.Mesh(new THREE.CircleGeometry(345, 96), mat(0xffffff, 1, { map: stripes })); grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; P.add(grass);
  const flat = (geo, color, y, r = 1) => { const m = new THREE.Mesh(geo, mat(color, r)); m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; P.add(m); return m; };
  const dirt = 0x8a5a3a;
  flat(new THREE.CircleGeometry(95, 80), dirt, .02).position.z = -59;                              // infield dirt arc (95 ft from the mound centre)
  const diamond = flat(new THREE.PlaneGeometry(76, 76), 0x2d6537, .04); diamond.rotation.z = Math.PI / 4; diamond.position.z = -63.64;   // infield grass inside the bases
  const home = flat(new THREE.CircleGeometry(13, 40), dirt, .05); home.position.z = 0;
  const lineMat = mat(CREAM, .9);
  for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(.4, .03, 330), lineMat); l.rotation.y = sx * Math.PI / 4; l.position.set(sx * 330 / 2 * Math.SQRT1_2, .06, -330 / 2 * Math.SQRT1_2); P.add(l); }
  for (const [x, z] of [[63.64, -63.64], [0, -127.28], [-63.64, -63.64]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.25, .3, 1.25), lineMat); b.position.set(x, .15, z); b.rotation.y = Math.PI / 4; P.add(b); }
  const plateShape = new THREE.Shape(); plateShape.moveTo(-.708, 0); plateShape.lineTo(.708, 0); plateShape.lineTo(.708, -.708); plateShape.lineTo(0, -1.417); plateShape.lineTo(-.708, -.708); plateShape.closePath();
  const plate = new THREE.Mesh(new THREE.ShapeGeometry(plateShape), mat(CREAM)); plate.rotation.x = -Math.PI / 2; plate.position.y = .08; plate.receiveShadow = true; P.add(plate);
  // mound: 18 ft across, 10 in high, flat top toward the rubber, sloping away
  const MOUND_Y = 10 / 12, mound = new THREE.Mesh(new THREE.LatheGeometry([[0, MOUND_Y], [6.5, MOUND_Y], [9, .02], [9.01, 0]].map(([x, y]) => new THREE.Vector2(x, y)), 48), mat(dirt, 1, { side: THREE.DoubleSide }));
  mound.position.z = -59.5; mound.receiveShadow = true; P.add(mound);
  const rubber = new THREE.Mesh(new THREE.BoxGeometry(2, .12, .5), mat(CREAM)); rubber.position.set(0, MOUND_Y + .06, -60.5); rubber.receiveShadow = true; P.add(rubber);
  const sector = (r0, r1, a0, a1, h, y, color) => {   // ring sector in plan; angle measured from -z (straight to centre field)
    const s = new THREE.Shape(), N = 48; s.moveTo(r1 * Math.sin(a0), r1 * Math.cos(a0));
    for (let i = 1; i <= N; i++) { const a = a0 + (a1 - a0) * i / N; s.lineTo(r1 * Math.sin(a), r1 * Math.cos(a)); }
    for (let i = N; i >= 0; i--) { const a = a0 + (a1 - a0) * i / N; s.lineTo(r0 * Math.sin(a), r0 * Math.cos(a)); }
    const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false }); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mat(color, .95)); m.position.y = y; m.receiveShadow = true; P.add(m); return m;
  };
  const A0 = -Math.PI * .5, A1 = Math.PI * .5;
  sector(330, 331, -Math.PI / 4, Math.PI / 4, 8, 0, INK);                                          // outfield wall, 8 ft, padding colour
  sector(330, 331, -Math.PI / 4, Math.PI / 4, .4, 8, ORANGE);                                       // orange line along the top
  for (let k = 0; k < 9; k++) sector(332 + k * 7, 332 + (k + 1) * 7, A0 * 1.02, A1 * 1.02, 6 + k * 5, 0, k % 2 ? 0x3a4256 : 0x333a4c);   // stepped tiers
  const crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 2.6, 1.2), new THREE.MeshStandardMaterial({ roughness: 1 }), 3400);
  const palette = [0x8b95aa, 0xa39688, 0x78897d, 0x9a7f8a, 0xb3a995, 0x7b88a0, 0x978f78], rnd = (() => { let a = 7; return () => (a = (a * 16807) % 2147483647) / 2147483647; })(), d = new THREE.Object3D();
  for (let i = 0; i < 3400; i++) { const k = Math.floor(rnd() * 9), ang = (rnd() * 2 - 1) * Math.PI * .5, r = 334 + k * 7 + rnd() * 5; d.position.set(r * Math.sin(ang), 6 + k * 5 + 1.3, -r * Math.cos(ang)); d.scale.setScalar(.8 + rnd() * .4); d.updateMatrix(); crowd.setMatrixAt(i, d.matrix); crowd.setColorAt(i, new THREE.Color(palette[Math.floor(rnd() * palette.length)])); }
  P.add(crowd);
  for (const [x, z] of [[-230, -250], [230, -250], [-300, -120], [300, -120]]) {                      // light towers: emissive panels
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 120), mat(0x20242c)); pole.position.set(x, 60, z); P.add(pole);
    const pan = new THREE.Mesh(new THREE.PlaneGeometry(34, 18), new THREE.MeshBasicMaterial({ color: 0xfff6e0, fog: false })); pan.position.set(x, 125, z); pan.lookAt(0, 60, -60); P.add(pan);
  }

  // ---------- stand-in figures (faceless primitives; the real ones come from the Blender pipeline) ----------
  const skin = mat(0x2a2a2a, .6), jersey = mat(INK, .8), pants = mat(CREAM, .8), navy = mat(0x1b2a4a, .8), grey = mat(0x5d6068, .8), trim = mat(ORANGE, .6), dark = mat(0x101010, .5);
  function seg(parent, a, b, r, m) { const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 10), m); mesh.castShadow = true; parent.add(mesh); const o = { mesh, set(a, b) { const dv = b.clone().sub(a), L = dv.length() || 1e-4; mesh.position.copy(a).addScaledVector(dv, .5); mesh.quaternion.setFromUnitVectors(V3(0, 1, 0), dv.normalize()); mesh.scale.set(1, L, 1); } }; o.set(a, b); return o; }
  function blob(parent, p, r, m, sy = 1) { const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m); mesh.position.copy(p); mesh.scale.y = sy; mesh.castShadow = true; parent.add(mesh); return mesh; }
  function person(j, o) {   // joints in feet, facing -z, feet at y = 0
    const g = new THREE.Group(), L = (a, b, r, m) => seg(g, j[a], j[b], r, m);
    L('aL', 'kL', .2, pants); L('kL', 'hL', .26, pants); L('aR', 'kR', .2, pants); L('kR', 'hR', .26, pants);
    blob(g, j.aL.clone().add(V3(0, -.1, -.25)), .24, dark, .7); blob(g, j.aR.clone().add(V3(0, -.1, -.25)), .24, dark, .7);
    L('hL', 'hR', .3, pants);
    const mid = a => j[a + 'L'].clone().add(j[a + 'R']).multiplyScalar(.5);
    seg(g, mid('h'), mid('s'), .42, o.top || jersey);
    L('sL', 'eL', .15, o.top || jersey); L('eL', 'wL', .12, skin); L('sR', 'eR', .15, o.sleeveR || o.top || jersey); L('eR', 'wR', .12, skin);
    seg(g, mid('s'), j.head, .09, skin); blob(g, j.head, .3, skin, 1.12);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(.34, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), o.cap || jersey); cap.position.copy(j.head).add(V3(0, .1, 0)); cap.castShadow = true; g.add(cap);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .03, 18, 1, false, -Math.PI / 2, Math.PI), o.brim || trim); brim.position.copy(j.head).add(V3(0, .1, -.12)); brim.rotation.y = Math.PI; g.add(brim);
    return g;
  }
  const mk = (a, b, c) => V3(a, b, c), mirror = o => { const r = {}; for (const k in o) r[k] = o[k]; return r; };
  // catcher: crouched, glove arm driven at runtime
  const cj = { aL: mk(-.7, .3, 0), kL: mk(-.95, 1.5, -.9), hL: mk(-.35, 1.55, .7), aR: mk(.7, .3, 0), kR: mk(.95, 1.5, -.9), hR: mk(.35, 1.55, .7), sL: mk(-.8, 3.1, -.1), sR: mk(.8, 3.1, -.1), eL: mk(-.9, 2.5, -.9), wL: mk(-.7, 2.3, -1.7), eR: mk(.9, 2.3, -.6), wR: mk(.5, 2.0, -.5), head: mk(0, 3.75, -.55) };
  const catcher = person(cj, { top: grey, cap: dark, brim: dark }); catcher.position.set(0, 0, 2.3); scene.add(catcher);
  const gloveSeg = seg(catcher, cj.eL, cj.wL, .12, skin), mitt = blob(catcher, cj.wL, .42, mat(0x3a2d22, .7), .8);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.6, .5), dark); guard.position.set(0, 2.5, -.2); guard.rotation.x = .25; guard.castShadow = true; catcher.add(guard);
  // umpire: standing crouch behind the catcher, offset toward the inside shoulder
  const uj = { aL: mk(-.6, .3, 0), kL: mk(-.7, 1.9, -.5), hL: mk(-.3, 3.0, .3), aR: mk(.6, .3, 0), kR: mk(.7, 1.9, -.5), hR: mk(.3, 3.0, .3), sL: mk(-.75, 4.5, -.3), sR: mk(.75, 4.5, -.3), eL: mk(-.95, 3.7, -.5), wL: mk(-.75, 2.35, -.5), eR: mk(.95, 3.7, -.5), wR: mk(.75, 2.35, -.5), head: mk(0, 5.1, -.55) };
  const umpire = person(uj, { top: navy, cap: navy, brim: dark }); umpire.position.set(.9, 0, 4.4); Object.values(umpire.children).forEach(c => c.material === pants && (c.material = grey)); scene.add(umpire);
  // batter (right-handed, third-base side): stance with hands back
  const bj = { aL: mk(-.95, .3, .1), kL: mk(-.85, 1.7, -.1), hL: mk(-.35, 3.1, .1), aR: mk(.95, .3, .1), kR: mk(.85, 1.7, -.1), hR: mk(.35, 3.1, .1), sL: mk(-.78, 4.9, 0), sR: mk(.78, 4.9, 0), eL: mk(-.7, 4.2, .9), wL: mk(-.45, 5.0, .75), eR: mk(.5, 4.3, .95), wR: mk(.55, 5.1, .75), head: mk(0, 5.65, -.15) };
  const batter = person(bj, { top: jersey, cap: dark, brim: dark }); batter.position.set(-2.9, 0, 0); batter.rotation.y = -Math.PI / 2;
  const bat = seg(batter, mk(.55, 5.0, .75), mk(1.3, 7.7, 1.5), .11, mat(0xb9926a, .5)); const helmet = new THREE.Mesh(new THREE.SphereGeometry(.37, 16, 10), dark); helmet.position.copy(bj.head).add(V3(0, .08, 0)); batter.add(helmet); scene.add(batter);

  // ---------- the pitcher: the real recorded motion ----------
  const draco = new DRACOLoader(); draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/');
  const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync('/models/pitcher.glb');
  const model = gltf.scene, holder = new THREE.Group(); holder.add(model); holder.scale.setScalar(FT); scene.add(holder);
  model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  let ex = {}; model.traverse(o => { if (o.userData && o.userData.releaseFrame !== undefined) ex = o.userData; });
  const FPS = ex.fps || 30, REL = ex.releaseFrame ?? 45, fwd = ex.forwardXY || [0, -1];
  holder.rotation.y = Math.atan2(fwd[0], fwd[1]) + Math.PI;   // the plate is at +z from the mound, so he must throw toward +z
  const bone = n => { let f = null; model.traverse(o => { if (!f && o.isBone && o.name.replace(/^mixamorig:?/, '') === n) f = o; }); return f; };
  const hand = bone('RightHand'), foot = bone('RightFoot'), headB = bone('Head');
  const mixer = new THREE.AnimationMixer(model), act = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, 'delivery')); act.play(); act.paused = true;
  const DUR = act.getClip().duration, tr = REL / FPS;
  const poseAt = t => { act.time = Math.min(Math.max(t, 0), DUR - 1e-3); mixer.update(0); holder.updateMatrixWorld(true); };
  poseAt(0); { const f = V3(0, 0, 0); foot.getWorldPosition(f); holder.position.set(-f.x, MOUND_Y, -f.z - 60.2); }   // pivot foot on the rubber
  poseAt(tr); const R0 = V3(0, 0, 0); hand.getWorldPosition(R0);                                        // where the hand really is at release

  // ---------- fake pitches (ILLUSTRATIVE) and the constant-acceleration flight ----------
  const MONTHS = [
    { m: 'Apr', mph: 94.1, rpm: 2280, plate: [-.25, 2.9], drift: [0, 0], ax: -7.0, bc: '1–1' },
    { m: 'May', mph: 94.8, rpm: 2310, plate: [.15, 3.0], drift: [.12, -.05], ax: -8.0, bc: '0–1' },
    { m: 'Jun', mph: 95.3, rpm: 2330, plate: [.45, 2.6], drift: [.2, -.1], ax: -8.5, bc: '1–2' },
    { m: 'Jul', mph: 95.0, rpm: 2300, plate: [-.05, 2.45], drift: [.25, -.15], ax: -7.5, bc: '2–1' }];
  const ZP = -17 / 12;     // front of the plate
  MONTHS.forEach(o => {
    o.r0 = R0.clone().add(V3(o.drift[0], o.drift[1], 0)); o.a = V3(o.ax, -17, 24);                      // fake: run, rise vs gravity, drag
    o.T = (o.r0.z - ZP) / (o.mph * 1.467 * .945);
    o.v = V3((o.plate[0] - o.r0.x - .5 * o.a.x * o.T * o.T) / o.T, (o.plate[1] - o.r0.y - .5 * o.a.y * o.T * o.T) / o.T, (ZP - o.r0.z - .5 * o.a.z * o.T * o.T) / o.T);
    o.at = t => V3(o.r0.x + o.v.x * t + .5 * o.a.x * t * t, o.r0.y + o.v.y * t + .5 * o.a.y * t * t, o.r0.z + o.v.z * t + .5 * o.a.z * t * t);
    o.catchT = tr + o.T; o.pts = Array.from({ length: 41 }, (_, i) => o.at(o.T * i / 40));
  });
  let cur = 1;

  // ---------- broadcast overlays ----------
  const ballTex = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 128, 64); g.strokeStyle = '#c8362b'; g.lineWidth = 3; for (const y of [14, 50]) { g.beginPath(); for (let x = 0; x <= 128; x += 2) g.lineTo(x, y + 7 * Math.sin(x / 128 * Math.PI * 4)); g.stroke(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(2.9 / 24, 24, 16), new THREE.MeshStandardMaterial({ map: ballTex, roughness: .6 })); ball.castShadow = true; scene.add(ball);
  const bShadow = new THREE.Mesh(new THREE.CircleGeometry(.3, 20), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .3, depthWrite: false })); bShadow.rotation.x = -Math.PI / 2; scene.add(bShadow);
  const NT = 64, tPos = new Float32Array(NT * 2 * 3), tA = new Float32Array(NT * 2), tE = new Float32Array(NT * 2), tIdx = [];
  for (let i = 0; i < NT; i++) { tE[i * 2] = -1; tE[i * 2 + 1] = 1; if (i < NT - 1) tIdx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2); }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(tPos, 3)); tg.setAttribute('a', new THREE.BufferAttribute(tA, 1)); tg.setAttribute('e', new THREE.BufferAttribute(tE, 1)); tg.setIndex(tIdx);
  const trail = new THREE.Mesh(tg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { fade: { value: 1 } },
    vertexShader: 'attribute float a;attribute float e;varying float vA;varying float vE;void main(){vA=a;vE=e;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform float fade;varying float vA;varying float vE;void main(){float s=1.-vE*vE;vec3 c=mix(vec3(1.,.34,.13),vec3(1.,.8,.55),s*s*.5);gl_FragColor=vec4(c,vA*s*fade);}' }));
  trail.frustumCulled = false; trail.renderOrder = 11; scene.add(trail);
  const zone = new THREE.Group(); { const w = (17 + 2.9) / 12, zb = 1.55, zt = 3.08, d = 17 / 12, lm = new THREE.LineBasicMaterial({ color: CREAM, transparent: true, opacity: .7, depthTest: false }), gm = new THREE.LineBasicMaterial({ color: CREAM, transparent: true, opacity: .18, depthTest: false });
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, zt - zb, d)); const e = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), lm); e.position.set(0, (zt + zb) / 2, -d / 2); zone.add(e);
    const glow = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: CREAM, transparent: true, opacity: .15, depthTest: false })); glow.scale.setScalar(1.04); glow.position.copy(e.position); zone.add(glow);
    const pts = []; for (let i = 1; i < 3; i++) { const x = -w / 2 + w * i / 3, y = zb + (zt - zb) * i / 3; pts.push(V3(x, zb, ZP), V3(x, zt, ZP), V3(-w / 2, y, ZP), V3(w / 2, y, ZP)); }
    zone.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), gm)); }
  zone.traverse(o => o.renderOrder = 10); scene.add(zone);
  const ripple = () => { const m = new THREE.Mesh(new THREE.RingGeometry(.88, 1, 56), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false })); m.renderOrder = 12; m.visible = false; scene.add(m); return m; };
  const rip1 = ripple(), rip2 = ripple();
  const ghostCol = i => new THREE.Color(CREAM).lerp(new THREE.Color(ORANGE), i / (MONTHS.length - 1));
  const ghosts = MONTHS.map((o, i) => { const c = ghostCol(i), g = new THREE.Group();
    const rel = new THREE.Mesh(new THREE.SphereGeometry(.25, 16, 12), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .85 })); rel.position.copy(o.r0);
    const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(o.pts), new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: .25 }));
    const pr = new THREE.Mesh(new THREE.RingGeometry(.09, .15, 24), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); pr.position.set(o.plate[0], o.plate[1], ZP + .01);
    g.traverse(o => { if (o.material) { o.material.depthTest = false; o.renderOrder = 9; } }); g.add(rel, ln, pr); g.visible = false; scene.add(g); return g; });

  // ---------- cameras (eased 0.6 s blends) ----------
  const CAMS = { broadcast: { p: V3(0, 17, 60), t: V3(0, 3.5, -26), f: 17 }, catcher: { p: V3(3.3, 4.9, 6.5), t: V3(-.2, 3.4, -30), f: 24 }, pitcher: { p: V3(0, 6.5, -67), t: V3(0, 2.4, 0), f: 20 } };
  const camera = new THREE.PerspectiveCamera(22, 16 / 9, .5, 2000);
  let from = 'broadcast', to = 'broadcast', blendT0 = -9, auto = true, shake = -9;
  const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const goCam = (k, manual) => { if (manual) { auto = false; document.querySelectorAll('[data-cam]').forEach(b => b.classList.toggle('on', b.dataset.cam === k)); } if (k === to) return; from = to; to = k; blendT0 = performance.now() / 1000; };
  function applyCam(now) {
    const p = Math.min(1, (now - blendT0) / .6), e = ease(p), a = CAMS[from], b = CAMS[to];
    camera.position.lerpVectors(a.p, b.p, e); const tg2 = V3(0, 0, 0).lerpVectors(a.t, b.t, e); camera.fov = a.f + (b.f - a.f) * e; camera.lookAt(tg2);
    if (p >= 1) from = to;
    if (!REDUCED && to === 'broadcast' && now - shake < .15) { const k = (1 - (now - shake) / .15) * .3 * Math.PI / 180; camera.rotateX((Math.random() - .5) * 2 * k); camera.rotateY((Math.random() - .5) * 2 * k); }
    camera.updateProjectionMatrix();
  }

  // ---------- playback ----------
  let phase = 'live', s = 0, speed = 1, pt = 0, last = performance.now() / 1000, replayHold = false;
  const cm = () => MONTHS[cur], hud = $('hud');
  function start() { phase = 'live'; s = 0; pt = 0; auto = true; replayHold = false; from = to = 'broadcast'; blendT0 = -9; document.querySelectorAll('[data-cam]').forEach(b => b.classList.toggle('on', b.dataset.cam === 'broadcast')); hud.style.opacity = 0; $('play').textContent = 'Replay'; }
  function setMonth(i) { cur = i; document.querySelectorAll('[data-month]').forEach(b => b.classList.toggle('on', +b.dataset.month === i)); const o = cm(); $('hT').textContent = 'Four-seam fastball'; $('hV').innerHTML = o.mph.toFixed(1) + '<small>mph</small>'; $('hM').textContent = o.rpm.toLocaleString() + ' rpm · Count ' + o.bc; start(); }
  const pxFt = (p, h) => h / (2 * camera.position.distanceTo(p) * Math.tan(camera.fov * Math.PI / 360));
  const tmp = V3(0, 0, 0), tmp2 = V3(0, 0, 0), right = V3(0, 0, 0), dirv = V3(0, 0, 0);
  function frame(now) {
    const dt = Math.min(.05, now - last); last = now;
    const o = cm(), H = canvas.clientHeight;
    if (phase === 'live') { s += dt * speed; if (s >= o.catchT + .4) { phase = 'blend1'; pt = 0; if (auto) goCam('catcher'); } }
    else if (phase === 'blend1') { s += dt * speed; pt += dt; if (pt >= .6) { phase = 'replay'; s = tr - .6; replayHold = REDUCED; } }
    else if (phase === 'replay') { if (!replayHold) s += dt * Math.min(speed, .25); if (s >= o.catchT + .3) { phase = 'blend2'; pt = 0; if (auto) goCam('broadcast'); } }
    else if (phase === 'blend2') { pt += dt; if (pt >= .6) { phase = 'done'; $('play').textContent = 'Replay'; } }
    if (phase !== 'done' && phase !== 'live') $('play').textContent = replayHold ? 'Play' : 'Replay';
    poseAt(s);
    // catcher: breathing idle, glove goes to the plate crossing point
    catcher.position.y = Math.sin(now * 2) * .02;
    const gl = s > tr + o.T * .45 ? Math.min(1, (s - tr - o.T * .45) / (o.T * .5)) : 0, tgt = V3(o.plate[0], o.plate[1], ZP + .35).sub(catcher.position), wl = cj.wL.clone().lerp(tgt, ease(gl));
    gloveSeg.set(cj.eL.clone().lerp(V3(o.plate[0] * .5, o.plate[1] - .3, -1.1), ease(gl)), wl); mitt.position.copy(wl);
    const load = Math.min(1, Math.max(0, (s - .85) / .5)); bat.set(mk(.55 - .15 * load, 5.0, .75 + .3 * load), mk(1.3 - .3 * load, 7.7 - .2 * load, 1.5 + .5 * load));
    // ball + trail
    let bp;
    if (s < tr) { hand.getWorldPosition(tmp); bp = tmp.clone(); } else if (s <= o.catchT) bp = o.at(s - tr); else bp = o.at(o.T);
    ball.position.copy(bp); { const r = Math.max(2.9 / 24, 1.6 / pxFt(bp, H)); ball.scale.setScalar(r / (2.9 / 24)); }
    ball.quaternion.setFromAxisAngle(V3(1, .15, 0).normalize(), s > tr ? -(s - tr) * o.rpm / 60 * 2 * Math.PI : 0);
    bShadow.position.set(bp.x, .1, bp.z); bShadow.scale.setScalar(.6 + bp.y * .05); bShadow.material.opacity = bp.y > 1 ? .18 : .3;
    const flown = Math.min(Math.max(s - tr, 0), o.T), after = s - o.catchT;
    trail.visible = s > tr + .005; trail.material.uniforms.fade.value = after < 1.5 ? 1 : Math.max(0, 1 - (after - 1.5) / .4);
    if (trail.visible) {
      for (let i = 0; i < NT; i++) { const u = i / (NT - 1), p = o.at(flown * u); const q = o.at(Math.min(o.T, flown * u + .004)); dirv.subVectors(q, p); if (dirv.lengthSq() < 1e-9) dirv.set(0, 0, -1);
        right.crossVectors(dirv, tmp2.subVectors(camera.position, p)).normalize(); const w = Math.max(.125, 2.2 / pxFt(p, H)) * (.1 + .9 * u);
        tPos.set([p.x - right.x * w, p.y - right.y * w, p.z - right.z * w, p.x + right.x * w, p.y + right.y * w, p.z + right.z * w], i * 6); tA[i * 2] = tA[i * 2 + 1] = Math.pow(u, 1.4); }
      tg.attributes.position.needsUpdate = true; tg.attributes.a.needsUpdate = true;
    }
    // ripples (plate crossing, then the glove) and the camera shake on the catch
    for (const [r, lag, big] of [[rip1, 0, 1.17], [rip2, .05, .6]]) { const age = after - lag; r.visible = age > 0 && age < .35; if (r.visible) { r.position.set(o.plate[0], o.plate[1], r === rip1 ? ZP : ZP + .6); r.scale.setScalar(.05 + big * ease(age / .35)); r.material.opacity = .9 * (1 - age / .35); } }
    if (after > 0 && after < .02 && now - shake > 1) shake = now;
    zone.children.forEach(c => c.material.opacity = c.material.opacity);
    // ghosts: finished months before the current one
    ghosts.forEach((g, i) => g.visible = ghostsOn && i < cur);
    // HUD + tags
    hud.style.opacity = (s >= tr || phase === 'replay' || phase === 'blend2' || phase === 'done') ? 1 : 0;
    applyCam(now);
    const tag = (el, wp) => { const v = wp.clone().project(camera); const ok = v.z < 1 && Math.abs(v.x) < 1.1; el.style.display = ok ? 'block' : 'none'; el.style.left = (v.x * .5 + .5) * canvas.clientWidth + 'px'; el.style.top = (-v.y * .5 + .5) * H + 'px'; };
    headB.getWorldPosition(tmp); tag($('tagP'), tmp.clone().add(V3(0, 1.6, 0))); tag($('tagB'), V3(-2.9, 7.6, 0));
    const w = canvas.clientWidth; if (canvas.width !== Math.round(w * renderer.getPixelRatio())) { renderer.setSize(w, H, false); camera.aspect = w / H; camera.updateProjectionMatrix(); }
    renderer.render(scene, camera);
  }
  let ghostsOn = true;
  renderer.setAnimationLoop(t => frame(t / 1000));

  // ---------- UI ----------
  $('months').innerHTML = MONTHS.map((o, i) => '<button data-month="' + i + '">' + o.m + '</button> ').join('');
  $('legend').innerHTML = MONTHS.map((o, i) => '<span data-lg="' + i + '"><i style="background:#' + ghostCol(i).getHexString() + '"></i>' + o.m + '</span>').join('');
  const syncLegend = () => document.querySelectorAll('[data-lg]').forEach(e => e.style.display = ghostsOn && +e.dataset.lg <= cur ? 'inline-block' : 'none');
  document.querySelectorAll('[data-month]').forEach(b => b.onclick = () => { setMonth(+b.dataset.month); syncLegend(); });
  document.querySelectorAll('[data-cam]').forEach(b => b.onclick = () => goCam(b.dataset.cam, true));
  document.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => { speed = +b.dataset.sp; document.querySelectorAll('[data-sp]').forEach(x => x.classList.toggle('on', x === b)); });
  $('play').onclick = () => { if (phase === 'replay' && replayHold) replayHold = false; else setMonth(cur); };
  $('ghosts').onclick = () => { ghostsOn = !ghostsOn; $('ghosts').classList.toggle('on', ghostsOn); syncLegend(); };
  $('clear').onclick = () => { ghostsOn = false; $('ghosts').classList.remove('on'); syncLegend(); };
  addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); $('play').click(); } else if (e.key === 'r' || e.key === 'R') setMonth(cur); else if ('123'.includes(e.key)) goCam(['broadcast', 'catcher', 'pitcher'][+e.key - 1], true); });
  setMonth(1); syncLegend(); $('load').style.display = 'none';
  window.__ready = true;
  window.__dbg = { probe: t => { poseAt(t); const o = {}; for (const [k, b] of [['hips', bone('Hips')], ['hand', hand], ['foot', foot], ['lfoot', bone('LeftFoot')], ['lhand', bone('LeftHand')], ['head', headB]]) { const v = V3(0, 0, 0); b.getWorldPosition(v); o[k] = [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]; } return o; }, fwd, ball, MONTHS, trailInfo: () => ({ vis: trail.visible, a: Array.from(tA).filter((_, i) => i % 16 === 0).map(x => +x.toFixed(2)), p0: Array.from(tPos.slice(0, 3)), pN: Array.from(tPos.slice((NT - 1) * 6, (NT - 1) * 6 + 3)) }), setS: v => { phase = 'hold'; s = v; }, goCam, get s() { return s; }, scene, camera, setMonth, REL, tr, cur: () => cur };
} catch (e) { $('load').textContent = 'failed: ' + (e && e.message || e); window.__err = String(e && e.stack || e); }
</script></body></html>`

export function GET() {
  if (process.env.NODE_ENV === 'production') return new Response('Not found', { status: 404 })
  return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}
