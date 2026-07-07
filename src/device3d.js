import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { launchBrowser } from './harness.js';

const THREE_DIR = fileURLToPath(new URL('./vendor/three/', import.meta.url));

// Headless WebGL needs an explicit software-GL backend or the canvas comes back
// black on modern Chromium; swiftshader is deterministic on a given machine.
const GL_ARGS = ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'];

// Aspect (height/width) of each device body, matching the flat frame table.
const DEVICE_ASPECT = { phone: 462 / 226, tablet: 486 / 366, mac: 404 / 660, watch: 192 / 158 };

// The scene: a real 3D device (rounded metal body, glass screen carrying the app
// screenshot, environment reflections, studio light, grounded contact shadow),
// rendered to a transparent PNG. Rebuilds per call so screenshot/kind/pose vary.
const SCENE_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}</style>
<script type="importmap">{"imports":{"three":"/three.module.js"}}</script></head>
<body><canvas id="c"></canvas>
<script type="module">
import * as THREE from 'three';
import { RoomEnvironment } from '/RoomEnvironment.js';
import { RoundedBoxGeometry } from '/RoundedBoxGeometry.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const BEZEL = { black: '#141416', white: '#e7e7ea', clay: '#c9c2ff' };

function shadowTexture() {
  const s = 256, cv = document.createElement('canvas'); cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)'); grad.addColorStop(0.55, 'rgba(0,0,0,0.28)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const SHADOW_TEX = shadowTexture();

let disposables = [];
function reset() { for (const d of disposables) { d.geometry?.dispose?.(); if (Array.isArray(d.material)) d.material.forEach(m=>m.dispose()); else d.material?.dispose?.(); } disposables = []; }

window.__renderDevice = async (p) => {
  reset();
  const W = p.px, H = Math.round(p.px * (p.canvasAspect || 1.25));
  renderer.setSize(W, H, false); canvas.width = W; canvas.height = H;

  const scene = new THREE.Scene();
  scene.environment = envTex;
  const cam = new THREE.PerspectiveCamera(28, W / H, 0.1, 100);

  const aspect = { phone: ${DEVICE_ASPECT.phone}, tablet: ${DEVICE_ASPECT.tablet}, mac: ${DEVICE_ASPECT.mac}, watch: ${DEVICE_ASPECT.watch} }[p.kind] || ${DEVICE_ASPECT.phone};
  const w = 1, h = aspect, depth = 0.135, radius = p.kind === 'watch' ? 0.34 : (p.kind === 'tablet' ? 0.06 : 0.13);

  const device = new THREE.Group();

  // metal body
  const bodyGeo = new RoundedBoxGeometry(w, h, depth, 6, radius);
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: BEZEL[p.bezel] || BEZEL.black, metalness: 0.9, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.35, envMapIntensity: 1.1 });
  const body = new THREE.Mesh(bodyGeo, bodyMat); device.add(body); disposables.push(body);

  // glass screen with the app screenshot
  const inset = p.kind === 'watch' ? 0.1 : 0.045;
  const sw = w - inset * 2, sh = h - inset * 2, sr = Math.max(0.01, radius - inset);
  const screenShape = new THREE.Shape();
  const rr = (ctx, x, y, ww, hh, r) => { ctx.moveTo(x + r, y); ctx.lineTo(x + ww - r, y); ctx.quadraticCurveTo(x + ww, y, x + ww, y + r); ctx.lineTo(x + ww, y + hh - r); ctx.quadraticCurveTo(x + ww, y + hh, x + ww - r, y + hh); ctx.lineTo(x + r, y + hh); ctx.quadraticCurveTo(x, y + hh, x, y + hh - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); };
  rr(screenShape, -sw/2, -sh/2, sw, sh, sr);
  const screenGeo = new THREE.ShapeGeometry(screenShape, 24);
  const uv = screenGeo.attributes.uv, pos = screenGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) { uv.setXY(i, (pos.getX(i) + sw/2) / sw, (pos.getY(i) + sh/2) / sh); }
  let screenMat;
  if (p.screenshot) {
    const tex = await new THREE.TextureLoader().loadAsync(p.screenshot);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    screenMat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.85, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.28 });
  } else {
    screenMat = new THREE.MeshPhysicalMaterial({ color: 0x0c0c12, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.0 });
  }
  const screen = new THREE.Mesh(screenGeo, screenMat);
  screen.position.z = depth / 2 + 0.001;
  device.add(screen); disposables.push(screen);

  // pose: pitch (rx3d) / yaw (ry3d) in degrees
  device.rotation.x = (p.rx3d || 0) * Math.PI / 180;
  device.rotation.y = (p.ry3d || 0) * Math.PI / 180;

  // grounded contact shadow beneath the device
  const shGeo = new THREE.PlaneGeometry(w * 1.9, h * 0.5);
  const shMat = new THREE.MeshBasicMaterial({ map: SHADOW_TEX, transparent: true, depthWrite: false, opacity: 0.9 });
  const shadow = new THREE.Mesh(shGeo, shMat);
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -h / 2 - 0.05; shadow.position.z = 0.05;
  disposables.push(shadow);

  const root = new THREE.Group(); root.add(device); root.add(shadow); scene.add(root);

  // lighting: key + soft fill + rim
  const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(2.5, 4, 5); scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe6ff, 0.5); fill.position.set(-3, 1, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 1.2); rim.position.set(-1.5, 2, -3); scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));

  // frame the device: fit its height to a fraction of the view
  const fitFrac = 0.74;
  const vFov = cam.fov * Math.PI / 180;
  const dist = (h / fitFrac) / (2 * Math.tan(vFov / 2));
  cam.position.set(0, 0, dist); cam.lookAt(0, 0, 0);

  renderer.render(scene, cam);
  return canvas.toDataURL('image/png');
};
window.__ready = true;
</script></body></html>`;

// Outer body width per kind, matching the flat frame table, so a 3D device lands
// at the same on-canvas footprint the flat one would have.
const DEVICE_BASE_W = { phone: 226, tablet: 366, mac: 660, watch: 158 };
const FIT_FRAC = 0.74; // fraction of the render view the device height fills (see scene)

// The image layer that replaces a `device` layer: the transparent 3D PNG placed
// at the device's position, sized (contain) so its body matches the flat width.
export function frameLayer(l, dataUrl) {
  const kind = l.kind || 'phone';
  const aspect = DEVICE_ASPECT[kind] || DEVICE_ASPECT.phone;
  const w0 = Math.round(DEVICE_BASE_W[kind] * (l.scale || 1) * aspect / FIT_FRAC);
  return { id: l.id, type: 'image', cx: l.cx, cy: l.cy, scale: 1, rot: l.rot || 0, w0, fit: 'contain', src: dataUrl };
}

export const KINDS_3D = new Set(['phone', 'tablet']);
export const TREATMENTS_3D = new Set(['plain', 'angled', undefined, null]);

// Renders a batch of device specs to transparent PNGs in one browser session.
// Each spec: { screenshot?: dataURL, kind, bezel, rx3d, ry3d }. Returns data URLs.
export async function renderDevices3d(specs, { browserPath = null, px = 1100 } = {}) {
  if (!specs.length) return [];
  const server = http.createServer(async (req, res) => {
    try {
      const name = req.url === '/' ? null : path.basename(req.url);
      if (!name) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(SCENE_HTML); return; }
      const data = await readFile(path.join(THREE_DIR, name));
      res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await launchBrowser(browserPath, { headless: true, args: GL_ARGS });
  try {
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction('window.__ready === true', { timeout: 30_000 });
    const out = [];
    for (const s of specs) {
      const canvasAspect = ({ phone: 1.55, tablet: 1.2, mac: 0.78, watch: 1.15 }[s.kind] || 1.5);
      const dataUrl = await page.evaluate((p) => window.__renderDevice(p), { ...s, px, canvasAspect });
      out.push({ dataUrl, canvasAspect });
    }
    return out;
  } finally {
    await browser.close();
    server.close();
  }
}
