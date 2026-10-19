// run_three_test.mjs — serves the repo over HTTP, opens test/three_load.html in headless Chrome (real time, via the DevTools
// protocol), waits for the page to finish, prints the JSON result and exits non-zero on failure.
//   node scripts/pitcher-asset/test/run_three_test.mjs
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIME = { '.html': 'text/html', '.glb': 'model/gltf-binary', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0);
await new Promise(r => server.once('listening', r));
const port = server.address().port;
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', '--no-first-run', '--user-data-dir=/tmp/pitcher-three-test', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) {
  try { target = (await (await fetch('http://127.0.0.1:9333/json')).json()).find(t => t.type === 'page'); } catch {}
  if (!target) await sleep(250);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${port}/scripts/pitcher-asset/test/three_load.html` });
let result = null;
for (let i = 0; i < 120 && !result; i++) {
  await sleep(500);
  const r = await send('Runtime.evaluate', { expression: "document.title==='done' ? document.getElementById('out').textContent : ''", returnByValue: true });
  if (r?.result?.value) result = r.result.value;
}
console.log(result || 'TIMEOUT: page never finished');
chrome.kill(); server.close();
let ok = false; try { ok = JSON.parse(result).ok === true; } catch {}
process.exit(ok ? 0 : 1);
