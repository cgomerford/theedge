// Dev-only mockup of the 3D pitcher (public/models/pitcher.glb, built by scripts/pitcher-asset). 404s in production.
// A route handler returning a self-contained page, so no `three` npm dependency is added for a mockup (three comes from the
// jsDelivr CDN, same as mockups/pitch-story.html). Not linked from anywhere: open http://localhost:3000/dev/pitcher-preview
// The ball path is a MOCK straight line from the recorded release point to the plate. It is not Statcast data.

export const dynamic = 'force-dynamic'

const PAGE = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pitcher Preview</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
<style>
:root{--cream:#FAF8F3;--ink:#1A1A1A;--orange:#FF5722;--line:#e7e2d8;--mute:#8a8275}
*{box-sizing:border-box}html,body{margin:0;background:var(--cream);color:var(--ink);font-family:'Outfit',system-ui,sans-serif}
.wrap{max-width:1240px;margin:0 auto;padding:20px 24px}
h1{font-weight:800;font-size:30px;letter-spacing:-.01em;margin:0 0 4px}h1 b{color:var(--orange);font-weight:800}
.sub{color:var(--mute);font-size:13px;margin-bottom:14px}
#stage{position:relative;width:100%;aspect-ratio:16/9;max-height:72vh;background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden}
canvas{width:100%;height:100%;display:block}
#status{position:absolute;left:14px;top:12px;font-size:12px;color:var(--mute);font-variant-numeric:tabular-nums}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}
button{font:600 13px 'Outfit',sans-serif;border:1px solid var(--line);background:#fff;border-radius:999px;padding:7px 14px;cursor:pointer;color:var(--ink)}
button.on{background:var(--ink);color:var(--cream);border-color:var(--ink)}
input[type=range]{flex:1;min-width:200px;accent-color:var(--orange)}
.k{font-size:10px;letter-spacing:.14em;font-weight:800;color:var(--orange);text-transform:uppercase;margin-right:4px}
.foot{font-size:11px;color:#a89e8c;margin-top:12px;line-height:1.5}
</style></head><body><div class="wrap">
<h1><b>⊕</b> Pitcher preview</h1>
<div class="sub">Dev mockup · public/models/pitcher.glb · recorded motion (CMU 124_02) on the generated body</div>
<div id="stage"><canvas id="c"></canvas><div id="status">loading…</div></div>
<div class="bar"><span class="k">Clip</span>
<button data-clip="delivery" class="on">Delivery</button><button data-clip="set">Set</button><button data-clip="idle_ready">Idle ready</button>
<span class="k" style="margin-left:12px">Camera</span>
<button data-cam="broadcast" class="on">Broadcast</button><button data-cam="wide">Wide (plate)</button><button data-cam="side">Side</button></div>
<div class="bar"><button id="play">Pause</button><input id="scrub" type="range" min="0" max="1000" value="0"><span id="frame" style="font-variant-numeric:tabular-nums;font-size:13px;min-width:120px">frame 0</span>
<button id="jRel">Release</button><button id="jStr">Leg lift</button><button id="speed">1×</button></div>
<div class="foot">Ball path is a mock straight line from the recorded release point to the plate, not Statcast data. Motion source: CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), NSF EIA-0196217.</div>
</div>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
const $ = id => document.getElementById(id), status = $('status');
try {
  const canvas = $('c'), renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xFAF8F3);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c4, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-4, 9, 6); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0xece6d8, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const PLATE_Z = -18.44;                                   // mound to plate, metres, along the throw direction (-Z)
  const plate = new THREE.Mesh(new THREE.CircleGeometry(.22, 5), new THREE.MeshBasicMaterial({ color: 0xffffff })); plate.rotation.x = -Math.PI / 2; plate.position.set(0, .01, PLATE_Z); scene.add(plate);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.0366, 16, 12), new THREE.MeshBasicMaterial({ color: 0xFF5722 })); ball.visible = false; scene.add(ball);

  const draco = new DRACOLoader(); draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/');
  const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync('/models/pitcher.glb');
  const model = gltf.scene, holder = new THREE.Group(); holder.add(model); scene.add(holder);
  let ex = {}; model.traverse(o => { if (o.userData && o.userData.releaseFrame !== undefined) ex = o.userData; });
  const FPS = ex.fps || 30, REL = ex.releaseFrame ?? 45, STR = ex.stretchFrame ?? 28, fwd = ex.forwardXY || [0, -1];
  holder.rotation.y = Math.atan2(fwd[0], fwd[1]);           // blender (x,y) -> glTF (x,-y); turn so he throws toward -Z, camera behind him
  const mixer = new THREE.AnimationMixer(model), actions = {};
  gltf.animations.forEach(c => { const a = mixer.clipAction(c); a.setLoop(THREE.LoopRepeat); actions[c.name] = a; });
  const bone = n => { let f = null; model.traverse(o => { if (!f && o.isBone && o.name.replace(/^mixamorig:?/, '') === n) f = o; }); return f; };   // three strips the ':' from node names
  const hand = bone('RightHand'), hips = bone('Hips');
  if (!hand || !hips) throw new Error('bones not found');
  let cur = 'delivery', playing = true, speed = 1, t = 0, rel = null;
  const dur = () => actions[cur].getClip().duration;
  function setClip(n) { Object.values(actions).forEach(a => a.stop()); cur = n; const a = actions[n]; a.reset().play(); a.paused = true; t = 0; rel = null; ball.visible = false; document.querySelectorAll('[data-clip]').forEach(b => b.classList.toggle('on', b.dataset.clip === n)); }
  setClip('delivery');
  mixer.update(0); model.updateMatrixWorld(true);           // put frame-0 hips at the origin so the mound is under him
  const h0 = new THREE.Vector3(); hips.getWorldPosition(h0); holder.position.set(-h0.x, 0, -h0.z);

  const cams = { broadcast: { pos: [0, 2.7, 14], tgt: [0, 1.15, 0], fov: 13 }, wide: { pos: [0, 2.7, 9], tgt: [0, 1.1, -9], fov: 32 }, side: { pos: [11, 1.5, -3], tgt: [0, 1.1, -3], fov: 22 } };
  let camKey = 'broadcast'; const camera = new THREE.PerspectiveCamera(13, 16 / 9, .1, 500);
  function setCam(k) { camKey = k; document.querySelectorAll('[data-cam]').forEach(b => b.classList.toggle('on', b.dataset.cam === k)); }
  function applyCam() { const c = cams[camKey]; camera.position.set(...c.pos); camera.fov = c.fov; camera.lookAt(...c.tgt); camera.updateProjectionMatrix(); }

  const tmp = new THREE.Vector3(), start = new THREE.Vector3(), end = new THREE.Vector3(0, .8, PLATE_Z), FLY = .42;
  function pose() {
    actions[cur].time = Math.min(t, dur() - 1e-4); mixer.update(0); model.updateMatrixWorld(true);
    if (cur === 'delivery') {
      const tr = REL / FPS;
      if (t >= tr && !rel) { hand.getWorldPosition(tmp); rel = tmp.clone(); }
      if (t < tr) rel = null;
      if (rel) { const p = Math.min(1, (t - tr) / FLY); ball.visible = true; ball.position.lerpVectors(rel, end, p); ball.position.y -= 4 * .12 * p * (1 - p) * -1; }
      else { ball.visible = t < tr; if (ball.visible) hand.getWorldPosition(ball.position); }
    } else ball.visible = false;
    $('scrub').value = Math.round(t / dur() * 1000); $('frame').textContent = 'frame ' + Math.round(t * FPS) + ' / ' + Math.round(dur() * FPS) + (cur === 'delivery' && Math.round(t * FPS) === REL ? ' · release' : '');
  }
  function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; if (canvas.width !== Math.round(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); } }
  let last = performance.now(); const HOLD = 1.2; let hold = 0;
  renderer.setAnimationLoop(now => {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (playing) { t += dt * speed; if (t >= dur() + (cur === 'delivery' ? HOLD : 0)) t = 0; }
    resize(); applyCam(); pose(); renderer.render(scene, camera);
  });
  document.querySelectorAll('[data-clip]').forEach(b => b.onclick = () => setClip(b.dataset.clip));
  document.querySelectorAll('[data-cam]').forEach(b => b.onclick = () => setCam(b.dataset.cam));
  $('play').onclick = () => { playing = !playing; $('play').textContent = playing ? 'Pause' : 'Play'; };
  $('scrub').oninput = e => { playing = false; $('play').textContent = 'Play'; t = e.target.value / 1000 * dur(); };
  $('jRel').onclick = () => { setClip('delivery'); playing = false; $('play').textContent = 'Play'; t = REL / FPS; };
  $('jStr').onclick = () => { setClip('delivery'); playing = false; $('play').textContent = 'Play'; t = STR / FPS; };
  $('speed').onclick = () => { speed = speed === 1 ? .25 : speed === .25 ? .5 : 1; $('speed').textContent = speed + '×'; };
  status.textContent = gltf.animations.length + ' clips · releaseFrame ' + REL + ' · ' + FPS + ' fps';
  window.__pitcherReady = true;
} catch (e) { status.textContent = 'failed to load: ' + (e && e.message || e); window.__pitcherError = String(e && e.stack || e); }
</script></body></html>`

export function GET() {
  if (process.env.NODE_ENV === 'production') return new Response('Not found', { status: 404 })
  return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}
