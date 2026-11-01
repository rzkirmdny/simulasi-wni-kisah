// Seri Dajjal, Part 1: Lelaki di Pulau. Wayang bayangan 2D di Three.js.
// Deterministik: window.__seek(t) menggambar frame di detik t (tanpa jam real-time),
// jadi aman dirender frame per frame di mana saja (lokal atau Colab).
import * as THREE from './lib/three.module.js';

const W = 1080, H = 1920;
const params = new URLSearchParams(location.search);
const PART = +(params.get('part') || 1);
const data = await (await fetch(`data_part${PART}.json`)).json();
const LINE = Object.fromEntries(data.lines.map(l => [l.line, l]));
const CAPS = data.captions;
const DUR = data.duration;

// ---------- util ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const easeOut = k => 1 - Math.pow(1 - clamp(k), 3);
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const noise = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u); };
const nz = (x, seed = 0) => noise(x + seed * 17.13) * 2 - 1;
const flick = t => 0.9 + 0.07 * nz(t * 6.0, 1) + 0.03 * nz(t * 17.0, 2);
const capStart = (line, sub) => { const c = CAPS.find(c => LINE[line] && c.start >= LINE[line].start - 0.01 && c.text.includes(sub)); return c ? c.start : LINE[line].start; };

// ---------- three ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.setClearColor(0x000000, 1);
document.getElementById('stage').prepend(renderer.domElement);
const scene = new THREE.Scene();
const cam = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, -10, 10);

let ORDER = 0;
function mat(color, opacity = 1, additive = false) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
}
function mk(geo, color, opacity = 1, additive = false) {
  const m = new THREE.Mesh(geo, mat(color, opacity, additive));
  m.renderOrder = ORDER++;
  return m;
}
function at(obj, x, y, s = 1) { obj.position.set(x, y, 0); obj.scale.setScalar(s); return obj; }
function polyGeo(pts) { const s = new THREE.Shape(); s.moveTo(...pts[0]); for (const p of pts.slice(1)) s.lineTo(...p); return new THREE.ShapeGeometry(s); }
function splineGeo(pts) {
  const v = pts.map(p => new THREE.Vector2(p[0], p[1]));
  const s = new THREE.Shape(); s.moveTo(v[0].x, v[0].y); s.splineThru([...v.slice(1), v[0]]);
  return new THREE.ShapeGeometry(s, 24);
}
function ellGeo(rx, ry, seg = 48) { return new THREE.CircleGeometry(1, seg).scale(rx, ry, 1); }
function rectGeo(w, h, cx = 0, cy = 0) { return new THREE.PlaneGeometry(w, h).translate(cx, cy, 0); }
function rrectGeo(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return new THREE.ShapeGeometry(s);
}
function ringGeo(rx, ry, th) { return new THREE.RingGeometry(1 - th, 1, 32).scale(rx, ry, 1); }
function archGeo(w, h) { // pintu/jendela lengkung
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(-w / 2, h - w / 2);
  s.absarc(0, h - w / 2, w / 2, Math.PI, 0, true); s.lineTo(w / 2, 0); s.lineTo(-w / 2, 0);
  return new THREE.ShapeGeometry(s, 16);
}

// pendar lembut (gradien radial), dipakai untuk semua cahaya
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
function glow(rx, ry, color, opacity = 1) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2, ry * 2), new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, opacity,
    depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.renderOrder = ORDER++; return m;
}

// warna wayang
const SIL = 0x140a05, SIL_OP = 0.94;
const sil = (geo, op = SIL_OP) => mk(geo, SIL, op);
const GLOW = 0xffc27a;

// ---------- latar dinding (cahaya teplok di dinding) ----------
function wallMaterial() {
  return new THREE.ShaderMaterial({
    transparent: false, depthTest: false, depthWrite: false,
    uniforms: {
      uTime: { value: 0 }, uFlick: { value: 1 }, uLight: { value: new THREE.Vector2(540, 1050) },
      uR: { value: 950 }, cA: { value: new THREE.Color(0xe9a55c) }, cB: { value: new THREE.Color(0x1c0e06) },
      uFlash: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float uTime, uFlick, uR, uFlash; uniform vec2 uLight; uniform vec3 cA, cB;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec2 p = vUv * vec2(1080., 1920.);
        float d = length(p - uLight) / uR;
        float l = exp(-d*d*1.5) * uFlick;
        vec3 c = mix(cB, cA, clamp(l, 0., 1.));
        c += cA * uFlash * 0.55;
        float v = length((vUv - .5) * vec2(1., 1.3));
        c *= 1. - .45 * smoothstep(.35, .95, v);
        c += (h(p + uTime) - .5) * .025;
        gl_FragColor = vec4(c, 1.);
      }`,
  });
}
function wall() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), wallMaterial());
  m.renderOrder = ORDER++; m.frustumCulled = false;
  return m;
}
function setWall(w, t, o = {}) {
  const u = w.material.uniforms;
  u.uTime.value = Math.floor(t * 6); // butiran ganti 6x per detik, bukan tiap frame (file jauh lebih kecil)
  u.uFlick.value = (o.bright ?? 1) * flick(t);
  if (o.cA) u.cA.value.set(o.cA);
  if (o.cB) u.cB.value.set(o.cB);
  if (o.light) u.uLight.value.set(o.light[0], o.light[1]);
  if (o.r) u.uR.value = o.r;
  u.uFlash.value = o.flash || 0;
}

// ---------- figur siluet ----------
function person(h = 1, opts = {}) { // siluet manusia berdiri, pakai sorban/kain kepala
  const g = new THREE.Group();
  const body = splineGeo([[-34, 0], [-30, 70], [-26, 120], [-22, 150], [0, 158], [22, 150], [26, 120], [30, 70], [34, 0]]);
  g.add(sil(body));
  g.add(at(sil(ellGeo(21, 24)), 0, 178));
  g.add(at(sil(ellGeo(25, 13)), 0, 192)); // sorban
  if (opts.cloak) g.add(sil(polyGeo([[-24, 150], [-46, 10], [-30, 0], [0, 140]])));
  g.scale.setScalar(h);
  return g;
}
function seatedBack(h = 1) { // jamaah duduk, tampak belakang
  const g = new THREE.Group();
  g.add(sil(splineGeo([[-60, 0], [-52, 40], [-38, 80], [0, 92], [38, 80], [52, 40], [60, 0]])));
  g.add(at(sil(ellGeo(24, 27)), 0, 112));
  g.add(at(sil(ellGeo(27, 12)), 0, 128));
  g.scale.setScalar(h);
  return g;
}
function palm(h = 1, lean = 0) {
  const g = new THREE.Group();
  const trunk = new THREE.Group();
  trunk.add(sil(polyGeo([[-10, 0], [10, 0], [6 + lean * 60, 420], [-6 + lean * 60, 420]])));
  g.add(trunk);
  const top = new THREE.Group(); top.position.set(lean * 60, 420, 0); g.add(top);
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * 0.05 + (i / 8) * Math.PI * 1.1;
    const f = new THREE.Group(); f.rotation.z = a - Math.PI / 2;
    f.add(sil(polyGeo([[0, -6], [150, -22], [220, -60], [150, 4], [0, 6]])));
    top.add(f);
  }
  g.userData.top = top;
  g.scale.setScalar(h);
  return g;
}
function chainLink(rx = 26, ry = 16, color = SIL, op = 1) { return mk(ringGeo(rx, ry, 0.36), color, op); }
function chainRow(n, step, color = SIL, op = 1, rx = 26, ry = 16) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) { const l = chainLink(rx, ry, color, op); l.position.x = i * step; if (i % 2) l.scale.y = 0.45; g.add(l); }
  return g;
}
function monastery(scale = 1, windowGlow = 0.0) {
  const g = new THREE.Group();
  g.add(sil(polyGeo([[-220, 0], [220, 0], [220, 190], [-220, 190]])));
  g.add(sil(polyGeo([[-80, 190], [80, 190], [80, 330], [-80, 330]])));
  g.add(sil(polyGeo([[-95, 330], [95, 330], [0, 410]])));
  const win = mk(archGeo(36, 70), 0xffb25a, windowGlow); win.position.set(0, 220, 0); g.add(win);
  g.userData.win = win;
  g.scale.setScalar(scale);
  return g;
}
function waveStrip(amp, len, y0, depth = 1400) {
  const pts = [];
  for (let x = -1800; x <= 1800; x += 20) pts.push([x, y0 + amp * Math.sin((x / len) * Math.PI * 2) + amp * 0.35 * Math.sin((x / len) * Math.PI * 4.3)]);
  pts.push([1800, y0 - depth], [-1800, y0 - depth]);
  return polyGeo(pts);
}
function ship() {
  const g = new THREE.Group();
  g.add(sil(splineGeo([[-230, 40], [-180, -40], [0, -60], [180, -40], [250, 60], [120, 20], [-120, 20]])));
  g.add(sil(rectGeo(12, 380, -10, 200)));
  g.add(sil(polyGeo([[-6, 380], [150, 120], [-6, 90]])));
  g.add(sil(polyGeo([[-14, 360], [-170, 110], [-14, 95]])));
  g.add(sil(polyGeo([[-10, 390], [40, 375], [-10, 362]])));
  return g;
}
function moonGeo(r, k) { // k: 0 = gelap, 1 = purnama, fase sabit di antaranya
  const s = new THREE.Shape();
  s.absarc(0, 0, r, Math.PI / 2, -Math.PI / 2, true);
  const rx = r * Math.abs(1 - 2 * k), dir = k < 0.5;
  s.absellipse(0, 0, rx, r, -Math.PI / 2, Math.PI / 2, !dir);
  return new THREE.ShapeGeometry(s, 40);
}
function creature() {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const r = 1 + 0.12 * nz(i * 0.9, 9);
    pts.push([Math.cos(a) * 260 * r, Math.max(-40, Math.sin(a) * 210 * r + 150)]);
  }
  g.add(sil(splineGeo(pts)));
  const hair = [];
  for (let i = 0; i < 70; i++) {
    const a = Math.PI * (0.02 + 0.96 * (i / 69));
    const len = 90 + 90 * hash(i * 3.1);
    const s = new THREE.Group();
    s.position.set(Math.cos(a) * 245, Math.sin(a) * 195 + 150, 0);
    s.rotation.z = a - Math.PI / 2 + (hash(i) - 0.5) * 0.6;
    s.add(sil(polyGeo([[-9, 0], [9, 0], [2, len], [-1, len]])));
    s.userData.base = s.rotation.z; s.userData.i = i;
    g.add(s); hair.push(s);
  }
  for (let i = 0; i < 26; i++) { // rumbai di sisi bawah
    const x = -250 + i * 20;
    const s = new THREE.Group(); s.position.set(x, -30, 0); s.rotation.z = Math.PI + (hash(i * 7) - 0.5) * 0.5;
    s.add(sil(polyGeo([[-8, 0], [8, 0], [0, 60 + 40 * hash(i * 5)]])));
    s.userData.base = s.rotation.z; s.userData.i = 100 + i; g.add(s); hair.push(s);
  }
  g.userData.hair = hair;
  return g;
}
function swayHair(c, t, amt = 0.12, speed = 1.4) {
  for (const s of c.userData.hair) s.rotation.z = s.userData.base + amt * nz(t * speed + s.userData.i * 0.37, 4);
}
function giantHead() { // lelaki berantai: kepala, rambut sangat keriting, bahu, belenggu
  const g = new THREE.Group();
  g.add(sil(splineGeo([[-520, -700], [-480, -280], [-300, -120], [-120, -70], [120, -70], [300, -120], [480, -280], [520, -700]]), 1));
  g.add(sil(rectGeo(150, 160, 0, -20), 1));
  g.add(sil(ellGeo(190, 230), 1)); g.children.at(-1).position.set(0, 170, 0);
  for (let i = 0; i < 34; i++) { // keriting
    const a = Math.PI * (-0.12 + 1.24 * (i / 33));
    const r = 200 + 30 * hash(i * 2.3);
    const c = sil(ellGeo(48 + 14 * hash(i), 44 + 12 * hash(i + 4)), 1);
    c.position.set(Math.cos(a) * r, 190 + Math.sin(a) * (r + 25), 0); g.add(c);
  }
  const collar = mk(rrectGeo(250, 46, 10), 0x2b1a10, 1); collar.position.set(0, -55, 0); g.add(collar);
  const eyeL = mk(ellGeo(30, 16), 0xffd27a, 1); eyeL.position.set(70, 190, 0); g.add(eyeL); // mata kiri (sisi kanan penonton) yang melihat
  const eglow = glow(160, 110, 0xff8a3c, 0); eglow.position.set(70, 190, 0); g.add(eglow);
  const grape = mk(ellGeo(30, 30), 0x5d5a3f, 0.55); grape.position.set(-70, 192, 0); g.add(grape); // mata kanan buta, menonjol
  const cuffs = new THREE.Group();
  for (const sx of [-1, 1]) {
    const cuff = mk(rrectGeo(110, 60, 12), 0x2b1a10, 1); cuff.position.set(sx * 150, -170, 0); cuffs.add(cuff);
  }
  g.add(cuffs);
  const chain = chainRow(14, 34, 0x3a2414, 1, 24, 15); chain.position.set(-230, -170, 0); g.add(chain);
  g.userData = { eyeL, glow: eglow, grape, chain };
  return g;
}

// ---------- karakter langgar (berwarna, diterangi teplok) ----------
function seated(o) {
  const g = new THREE.Group();
  const skin = o.skin ?? 0xb7774c;
  g.add(at(mk(ellGeo(150, 46), o.legs), 0, 40));
  if (o.legStripe) for (let i = -2; i <= 2; i++) g.add(at(mk(rectGeo(10, 70), o.legStripe, 0.5), i * 50, 40));
  const torso = mk(splineGeo([[-95, 55], [-100, 160], [-85, 280], [-40, 312], [40, 312], [85, 280], [100, 160], [95, 55]]), o.body);
  g.add(torso);
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-82, 270, 0); armR.position.set(82, 270, 0);
  armL.add(at(mk(rrectGeo(46, 190, 22), o.body), 0, -95)); armL.add(at(mk(ellGeo(24, 22), skin), 0, -195));
  armR.add(at(mk(rrectGeo(46, 190, 22), o.body), 0, -95)); armR.add(at(mk(ellGeo(24, 22), skin), 0, -195));
  armL.rotation.z = -0.35; armR.rotation.z = 0.35;
  g.add(armL, armR);
  g.add(at(mk(rectGeo(44, 40), skin), 0, 325));
  if (o.hijab) g.add(at(mk(splineGeo([[-100, 250], [-108, 360], [-80, 450], [0, 482], [80, 450], [108, 360], [100, 250], [0, 228]]), o.hijab), 0, 0));
  const head = new THREE.Group(); head.position.set(0, 390, 0); g.add(head);
  head.add(mk(ellGeo(62, 72), skin));
  if (o.hair) head.add(at(mk(ellGeo(68, 46), o.hair), 0, 40));
  if (o.peci) head.add(at(mk(polyGeo([[-62, 40], [62, 40], [56, 92], [-56, 92]]), 0x161210), 0, 0));
  if (o.beard) head.add(at(mk(ellGeo(40, 30), o.beard), 0, -42));
  const eyes = [];
  for (const sx of [-1, 1]) { const e = mk(ellGeo(7, 9), 0x1a0f0a); e.position.set(sx * 22, 8, 0); head.add(e); eyes.push(e); }
  const mouth = mk(ellGeo(14, 3), 0x3a1a12); mouth.position.set(0, -32, 0); head.add(mouth);
  g.userData = { head, mouth, eyes, armL, armR };
  return g;
}
function animTalk(c, t, talking, seed) {
  const u = c.userData;
  u.mouth.scale.y = talking ? 1 + 3.2 * Math.abs(nz(t * 11, seed)) : 1;
  u.head.rotation.z = (talking ? 0.05 : 0.02) * nz(t * 0.9, seed + 3);
  const blink = hash(Math.floor(t * 0.6 + seed)) > 0.7 && ((t * 0.6 + seed) % 1) < 0.06;
  for (const e of u.eyes) e.scale.y = blink ? 0.15 : 1;
}

// ---------- adegan ----------
const scenes = [];
function addScene(start, end, build, fade = [0.25, 0.25]) {
  const group = new THREE.Group(); group.visible = false; scene.add(group);
  const s = { start, end, group, fade, update: () => {} };
  build(s, group);
  scenes.push(s);
  return s;
}
function zoomer(root, z, fx = 0, fy = 0) { root.scale.setScalar(z); root.position.set(-fx * (z - 1), -fy * (z - 1), 0); }

const T = name => LINE[name];

// 1) HOOK: lelaki berantai di kegelapan
addScene(0, T('02_narator_janji').start, (s, g) => {
  const w = wall(); g.add(w);
  const root = new THREE.Group(); g.add(root);
  const head = giantHead(); head.position.set(0, -260, 0); root.add(head);
  const fg = chainRow(40, 40, 0x0a0503, 1, 30, 19); fg.position.set(-820, -560, 0); fg.rotation.z = 0.22; root.add(fg);
  s.update = (t) => {
    setWall(w, t, { cA: 0xb4431c, cB: 0x070302, light: [540, 1050], r: 700, bright: 1.0 });
    zoomer(root, 1 + 0.03 * t, 0, 200);
    const u = head.userData;
    const open = smooth(0.9, 1.6, t);
    u.eyeL.scale.y = 0.08 + 0.92 * open;
    u.glow.material.opacity = 0.55 * open * flick(t);
    u.chain.position.y = -170 + 6 * Math.sin(t * 2.2);
    fg.position.y = -560 + 10 * Math.sin(t * 1.7);
  };
}, [0, 0.3]);

// 2) PULAU di laut malam
addScene(T('02_narator_janji').start, T('03_narator_langgar').start - 0.9, (s, g) => {
  const w = wall(); g.add(w);
  const root = new THREE.Group(); g.add(root);
  const moon = mk(ellGeo(70, 70), 0xffe6b8, 0.95); moon.position.set(250, 640, 0); root.add(moon);
  const island = new THREE.Group(); island.position.set(0, -150, 0); root.add(island);
  island.add(sil(splineGeo([[-420, -40], [-300, 60], [-120, 150], [60, 170], [240, 110], [420, -40]])));
  const mon = monastery(0.42, 0.9); mon.position.set(40, 140, 0); island.add(mon);
  const p1 = palm(0.55, -0.15); p1.position.set(-250, 40, 0); island.add(p1);
  const waves = [waveStrip(18, 260, -190), waveStrip(24, 340, -280), waveStrip(30, 420, -400)].map((geo, i) => {
    const m = sil(geo, 0.75 + i * 0.08); root.add(m); return m;
  });
  const chain = chainRow(26, 40, 0x0a0503, 0.9, 30, 19); chain.position.set(-560, 420, 0); chain.rotation.z = -0.12; root.add(chain);
  const tChain = capStart('02_narator_janji', 'Dirantai');
  s.update = (t) => {
    const lt = t - s.start;
    setWall(w, t, { cA: 0xd99a5e, cB: 0x120804, light: [790, 1600], r: 1100, bright: 0.9 });
    zoomer(root, 1 + 0.012 * lt + 0.2 * smooth(tChain, tChain + 3, t), 40, -20);
    waves.forEach((m, i) => { m.position.x = ((t * (14 + i * 10)) % (260 + i * 80)); m.position.y = 6 * Math.sin(t * (0.9 + i * 0.3)); });
    chain.children.forEach(c => c.material.opacity = 0.9 * smooth(tChain - 0.2, tChain + 0.5, t));
    chain.position.y = 420 + 8 * Math.sin(t * 1.4);
  };
}, [0.3, 0.6]);

// 3) LANGGAR: mati lampu, teplok, tiga karakter
const tLamp = T('03_narator_langgar').start - 0.9; // klik padam
addScene(tLamp, T('07_narator_madinah').start, (s, g) => {
  const root = new THREE.Group(); g.add(root);
  // dinding papan
  for (let i = 0; i < 13; i++) root.add(at(mk(rectGeo(86, 1300), i % 2 ? 0x4b3122 : 0x573a28), -540 + 43 + i * 86, 340));
  root.add(at(mk(rectGeo(1080, 20), 0x2c1c12), 0, -300));
  // jendela + hujan
  const winG = new THREE.Group(); winG.position.set(-250, 430, 0); root.add(winG);
  winG.add(mk(rectGeo(320, 420), 0x2a2216));
  winG.add(mk(rectGeo(286, 386), 0x0d1420));
  const rain = [];
  for (let i = 0; i < 40; i++) { const r = mk(rectGeo(2.5, 36), 0x6f86a8, 0.55); winG.add(r); rain.push(r); }
  for (let i = -1; i <= 1; i++) winG.add(at(mk(rectGeo(12, 386), 0x2a2216), i * 72, 0));
  winG.add(mk(rectGeo(286, 12), 0x2a2216));
  // rak Quran + papan jadwal shalat
  root.add(at(mk(rectGeo(260, 16), 0x2c1c12), 270, 560));
  [0x5b1d1a, 0x1f3a2c, 0x5b1d1a, 0x3a2c1a, 0x1f3a2c, 0x5b1d1a].forEach((c, i) => root.add(at(mk(rectGeo(30, 90 + (i % 3) * 8), c), 175 + i * 36, 614 + (i % 3) * 4)));
  root.add(at(mk(rectGeo(230, 190), 0x2f2418), 270, 360));
  for (let i = 0; i < 5; i++) root.add(at(mk(rectGeo(170, 8), 0x8d7a5c, 0.6), 270, 420 - i * 30));
  // bayangan karakter di dinding (wayang yang menunggu)
  const shadows = new THREE.Group(); root.add(shadows);
  // lantai karpet
  root.add(at(mk(rectGeo(1080, 700), 0x5e1b1b), 0, -660));
  for (let i = 0; i < 6; i++) root.add(at(mk(rectGeo(1080, 6), 0x7a2c22, 0.7), 0, -340 - i * 90));
  // karakter
  const raka = seated({ body: 0x8e2f2a, legs: 0x2d3a4a, hair: 0x1b1410 }); at(raka, -300, -560, 0.95); root.add(raka);
  const phone = mk(rrectGeo(36, 62, 6), 0x9fd2ff, 1); phone.position.set(-250, -300, 0); root.add(phone);
  const phoneGlow = glow(170, 170, 0x5aa8ff, 0.18); phoneGlow.position.set(-262, -230, 0); root.add(phoneGlow);
  const nisa = seated({ body: 0x6c4f7d, legs: 0x6c4f7d, hijab: 0xb45f7a }); at(nisa, -60, -610, 0.74); root.add(nisa);
  const abah = seated({ body: 0xd5c6a6, legs: 0x5a3b2e, legStripe: 0x2c1a12, peci: true, beard: 0xd8d3c8, skin: 0xa8693f }); at(abah, 280, -560, 1.12); root.add(abah);
  for (const [c, sc] of [[raka, 1.5], [nisa, 1.5], [abah, 1.45]]) {
    const sh = new THREE.Group();
    sh.add(sil(splineGeo([[-95, 55], [-100, 160], [-85, 280], [-40, 312], [40, 312], [85, 280], [100, 160], [95, 55]]), 0.5));
    sh.add(at(sil(ellGeo(66, 76), 0.5), 0, 390));
    sh.userData.src = c; sh.userData.k = sc; shadows.add(sh);
  }
  // teplok
  const lampX = 70, lampY = -760;
  const lamp = new THREE.Group(); lamp.position.set(lampX, lampY, 0); root.add(lamp);
  lamp.add(mk(ellGeo(70, 22), 0x3a2a1a));
  lamp.add(at(mk(splineGeo([[-55, 0], [-60, 50], [-30, 90], [30, 90], [60, 50], [55, 0]]), 0x6b5536), 0, 10));
  lamp.add(at(mk(rrectGeo(56, 130, 24), 0xfff1d6, 0.28), 0, 160));
  const flame = mk(splineGeo([[0, 0], [14, 20], [8, 50], [0, 70], [-8, 50], [-14, 20]]), 0xffd27a, 1); flame.position.set(0, 120, 0); lamp.add(flame);
  const halo = glow(240, 240, 0xff9a3c, 0.3); halo.position.set(0, 160, 0); lamp.add(halo);
  // tangan Abah jadi bayangan raksasa
  const hand = new THREE.Group(); hand.position.set(lampX, 120, 0); root.add(hand);
  hand.add(sil(splineGeo([[-90, -200], [-110, 0], [-100, 120], [-60, 170], [60, 170], [100, 120], [110, 0], [90, -200]]), 1));
  [[-75, 170, 0.12], [-25, 185, 0.04], [25, 185, -0.04], [72, 170, -0.12]].forEach(([x, y, r]) => { const f = sil(rrectGeo(40, 170, 20), 1); f.position.set(x, y + 70, 0); f.rotation.z = r; hand.add(f); });
  const th = sil(rrectGeo(40, 130, 20), 1); th.position.set(130, 20, 0); th.rotation.z = -0.8; hand.add(th);
  hand.visible = false;
  // gelap + cahaya teplok
  const darkM = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: { uL: { value: new THREE.Vector2(540 + lampX, 960 + lampY + 160) }, uK: { value: 1 }, uOn: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `varying vec2 vUv; uniform vec2 uL; uniform float uK, uOn;
      void main(){ vec2 p = vUv * vec2(1080., 1920.); float d = length((p - uL) * vec2(1., .85)) / (1150. * uK);
        float light = exp(-d*d*2.2) * uOn; float a = clamp(1. - light, 0., .97);
        gl_FragColor = vec4(.03, .015, .0, a); }`,
  });
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), darkM); dark.renderOrder = ORDER++; dark.frustumCulled = false; g.add(dark);
  const warm = mk(rectGeo(W, H), 0xff8a2a, 0.08, true); g.add(warm);
  const tStrike = tLamp + 0.55, tOn = tLamp + 0.8;
  const tHand = T('06_abah_kisahasli').end + 0.1, tCut = T('07_narator_madinah').start;
  const talk = (name, t) => t >= T(name).start && t <= T(name).end;
  s.update = (t) => {
    const on = t < tLamp + 0.08 ? 1 : smooth(tOn, tOn + 0.7, t);
    const strike = t > tStrike && t < tOn + 0.2 ? 0.35 : 0;
    darkM.uniforms.uOn.value = Math.max(on, strike) * flick(t);
    darkM.uniforms.uK.value = t < tLamp + 0.08 ? 3 : 1;
    flame.visible = halo.visible = t > tOn;
    flame.scale.set(1 + 0.08 * nz(t * 9, 3), 1 + 0.15 * nz(t * 13, 4), 1);
    halo.material.opacity = 0.45 * flick(t);
    warm.material.opacity = 0.07 * on;
    rain.forEach((r, i) => { r.position.set(-130 + hash(i) * 260, 190 - (((t * 600 + hash(i + 50) * 400) % 400)), 0); });
    // zoom pelan ke arah tengah, lalu ke tangan
    zoomer(root, 1 + 0.008 * (t - tLamp) + 0.25 * smooth(tHand, tCut, t), lampX, lampY + 400);
    animTalk(raka, t, talk('04_raka_bermuda', t), 1);
    animTalk(nisa, t, talk('05_nisa_matilampu', t), 2);
    animTalk(abah, t, talk('06_abah_kisahasli', t), 3);
    const ph = t < T('06_abah_kisahasli').start ? 1 : 0.4;
    phone.material.opacity = ph; phoneGlow.material.opacity = 0.18 * ph;
    // Nisa merapat ke Abah setelah bicara
    nisa.position.x = lerp(-60, 60, smooth(T('05_nisa_matilampu').end, T('05_nisa_matilampu').end + 0.8, t));
    // Abah mengangkat tangan ke depan teplok
    const up = smooth(tHand, tHand + 0.6, t);
    abah.userData.armL.rotation.z = lerp(-0.35, -2.4, up);
    hand.visible = t > tHand + 0.5;
    const grow = smooth(tHand + 0.5, tCut, t);
    hand.scale.setScalar(lerp(0.6, 9, grow * grow));
    hand.position.y = lerp(120, 300, grow);
    shadows.children.forEach((sh) => {
      const c = sh.userData.src, k = sh.userData.k * (1 + 0.02 * nz(t * 6, 5));
      sh.position.set(lampX + (c.position.x - lampX) * k, 260 + (c.position.y - lampY) * 0.25, 0);
      sh.scale.setScalar(c.scale.x * k * 0.75);
      sh.visible = t > tOn;
    });
  };
}, [0, 0]);

// 4) MADINAH: seruan, jamaah, mimbar bercahaya, Tamim ad-Dari
const tM = T('07_narator_madinah').start;
const tInside = capStart('07_narator_madinah', 'Selesai shalat');
const tTamim = capStart('07_narator_madinah', 'Tamim');
addScene(tM, T('08_narator_badai').start, (s, g) => {
  const w = wall(); g.add(w);
  // luar masjid
  const out = new THREE.Group(); g.add(out);
  out.add(at(sil(rectGeo(1400, 500)), 0, -760));
  const mosque = new THREE.Group(); mosque.position.set(-120, -510, 0); out.add(mosque);
  const ms = new THREE.Shape(); ms.moveTo(-330, 0); ms.lineTo(330, 0); ms.lineTo(330, 300); ms.lineTo(-330, 300); ms.lineTo(-330, 0);
  for (let i = 0; i < 5; i++) { const hole = new THREE.Path(); const x = -260 + i * 130; hole.moveTo(x - 38, 0); hole.lineTo(x - 38, 150); hole.absarc(x, 150, 38, Math.PI, 0, true); hole.lineTo(x + 38, 0); hole.lineTo(x - 38, 0); ms.holes.push(hole); }
  mosque.add(sil(new THREE.ShapeGeometry(ms, 12)));
  for (let i = 0; i < 5; i++) mosque.add(at(mk(archGeo(76, 188), 0xffb25a, 0.35), -260 + i * 130, 0));
  mosque.add(at(sil(rectGeo(700, 26)), 0, 312));
  const fr = [[-360, 320]]; for (let i = 0; i <= 36; i++) fr.push([-360 + i * 20, 320 + (i % 2 ? 26 : 8)]); fr.push([360, 320]);
  mosque.add(sil(polyGeo(fr))); // atap pelepah kurma
  mosque.scale.setScalar(1.3);
  const palms = [palm(0.9, 0.1), palm(1.1, -0.12), palm(0.8, 0.05)];
  palms[0].position.set(330, -520, 0); palms[1].position.set(-460, -520, 0); palms[2].position.set(470, -520, 0);
  palms.forEach(p => out.add(p));
  const walkers = [];
  for (let i = 0; i < 8; i++) { const p = person(1.15 + 0.1 * hash(i), { cloak: i % 2 === 0 }); out.add(p); walkers.push(p); }
  const waves = [];
  // dalam masjid
  const inn = new THREE.Group(); g.add(inn);
  const beam = mk(polyGeo([[-130, 960], [130, 960], [260, -260], [-260, -260]]), 0xffd08a, 0.0, true); beam.position.set(-120, 0, 0); inn.add(beam);
  const mimbar = new THREE.Group(); mimbar.position.set(-120, -300, 0); inn.add(mimbar);
  [[0, 0, 300, 60], [30, 60, 240, 60], [60, 120, 180, 60]].forEach(([x, y, ww, hh]) => mimbar.add(sil(rectGeo(ww, hh, x + ww / 2 - 150, y + hh / 2))));
  mimbar.add(sil(rectGeo(110, 200, 90, 280)));
  mimbar.add(sil(polyGeo([[30, 380], [150, 380], [90, 460]])));
  mimbar.add(sil(polyGeo([[-150, 60], [-140, 80], [60, 260], [60, 230]])));
  const mimbarGlow = glow(380, 420, 0xffcc80, 0); mimbarGlow.position.set(-60, -40, 0); inn.add(mimbarGlow);
  const crowd = [];
  for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) {
    const p = seatedBack(1.25 + r * 0.25); p.position.set(-470 + i * 190 + (r % 2) * 90, -560 - r * 150, 0); inn.add(p); crowd.push(p);
  }
  const tamimGlow = glow(260, 330, 0xffc27a, 0); inn.add(tamimGlow);
  const tamim = person(1.7, { cloak: true }); inn.add(tamim);
  const nameEl = document.getElementById('name');
  s.update = (t) => {
    const lt = t - tM;
    setWall(w, t, { cA: 0xeaa863, cB: 0x1a0c05, light: [540, 1250], r: 1050 });
    const inside = smooth(tInside - 0.35, tInside + 0.35, t);
    out.visible = inside < 1; inn.visible = inside > 0;
    out.traverse(o => o.material && (o.material.opacity = (o.material.userData.o ??= o.material.opacity) * (1 - inside)));
    inn.traverse(o => o.material && (o.material.opacity = (o.material.userData.o ??= o.material.opacity) * inside));
    // luar
    zoomer(out, 1 + 0.01 * lt, -120, -400);
    walkers.forEach((p, i) => {
      const k = clamp((lt - i * 0.55) / 6.5);
      p.position.set(lerp(620 + i * 40, -40 - (i % 3) * 60, k), -560 + Math.abs(Math.sin(lt * 5 + i)) * 8 * (k < 1 ? 1 : 0), 0);
      p.visible = k > 0 && k < 1;
    });
    palms.forEach((p, i) => { p.userData.top.rotation.z = 0.04 * nz(t * 0.7, i + 10); });
    // dalam
    zoomer(inn, 1 + 0.18 * smooth(tInside, tTamim, t) - 0.12 * smooth(tTamim - 0.5, tTamim + 1, t), -120, -100);
    beam.material.opacity = 0.22 * inside * flick(t);
    mimbarGlow.material.opacity = 0.35 * inside * flick(t + 3);
    const hl = smooth(tTamim, tTamim + 0.8, t);
    tamim.position.set(340, lerp(-760, -430, easeOut(hl)), 0);
    tamim.traverse(o => o.material && (o.material.opacity = SIL_OP * hl));
    tamimGlow.position.set(340, tamim.position.y + 170, 0);
    tamimGlow.material.opacity = 0.5 * hl * inside;
    if (hl > 0 && t < s.end) {
      nameEl.textContent = 'TAMIM AD-DARI';
      inn.updateMatrixWorld(true);
      const v = new THREE.Vector3(tamim.position.x, tamim.position.y + 400, 0).applyMatrix4(inn.matrixWorld);
      nameEl.style.top = `${960 - v.y - 30}px`; nameEl.style.opacity = hl;
    }
  };
}, [0.3, 0.3]);

// 5) BADAI sebulan, lalu senja dan pulau
const tB = T('08_narator_badai').start;
const tMonth = capStart('08_narator_badai', 'Sebulan');
const tSunset = capStart('08_narator_badai', 'Sampai');
addScene(tB, T('09_tamim_sekoci').start, (s, g) => {
  const w = wall(); g.add(w);
  const root = new THREE.Group(); g.add(root);
  const sun = mk(ellGeo(170, 170), 0xffb070, 0); sun.position.set(0, -60, 0); root.add(sun);
  const moon = mk(moonGeo(70, 0.5), 0xffe6b8, 0.95); moon.position.set(270, 660, 0); root.add(moon);
  const island = new THREE.Group(); island.position.set(330, -150, 0); root.add(island);
  island.add(sil(splineGeo([[-200, -30], [-120, 40], [0, 90], [130, 50], [210, -30]])));
  const mon = monastery(0.2, 0.8); mon.position.set(10, 80, 0); island.add(mon);
  const back = sil(waveStrip(30, 300, -120), 0.8); root.add(back);
  const boat = ship(); boat.position.set(-60, -260, 0); boat.scale.setScalar(1.05); root.add(boat);
  const front = sil(waveStrip(46, 380, -330), 1); root.add(front);
  const front2 = sil(waveStrip(36, 460, -500), 1); root.add(front2);
  const rainG = new THREE.Group(); root.add(rainG);
  const drops = []; for (let i = 0; i < 70; i++) { const d = sil(rectGeo(3, 60), 0.5); d.rotation.z = 0.35; rainG.add(d); drops.push(d); }
  s.update = (t) => {
    const lt = t - tB;
    const calm = smooth(tSunset, tSunset + 2.5, t);
    const storm = 1 - calm;
    // kilat
    let flash = 0;
    for (const ft of [tB + 3.2, tB + 6.9, tMonth + 1.5, tMonth + 3.6]) flash = Math.max(flash, storm * Math.max(0, 1 - Math.abs(t - ft) / 0.12));
    setWall(w, t, {
      cA: new THREE.Color(0xc98a55).lerp(new THREE.Color(0xff8a4a), calm).getHex(),
      cB: new THREE.Color(0x0e0705).lerp(new THREE.Color(0x2a0b06), calm).getHex(),
      light: [540, lerp(1200, 900, calm)], r: lerp(950, 1250, calm), flash,
    });
    // bulan berganti fase cepat selama "sebulan"
    const mk_ = clamp((t - tMonth) / (tSunset - tMonth));
    const phase = (lt < tMonth - tB) ? 0.75 : (0.75 + mk_ * 1.0) % 1;
    moon.geometry.dispose(); moon.geometry = moonGeo(70, Math.max(0.02, phase));
    moon.material.opacity = 0.95 * (1 - calm);
    moon.position.x = 270 - 80 * mk_;
    sun.material.opacity = 0.9 * calm; sun.position.y = lerp(80, -40, calm);
    island.visible = calm > 0.01; island.scale.setScalar(0.6 + 0.4 * calm);
    island.traverse(o => o.material && (o.material.opacity = (o === mon.userData.win ? 0.8 : SIL_OP) * calm));
    const roll = 0.16 * storm + 0.03;
    boat.rotation.z = roll * Math.sin(t * 1.7) + 0.04 * nz(t * 0.8, 6);
    boat.position.y = -260 + (34 * storm + 8) * Math.sin(t * 1.3 + 0.5);
    boat.position.x = -60 + 20 * Math.sin(t * 0.4);
    back.position.set(((t * (60 * storm + 12)) % 300), 10 * Math.sin(t * 1.1), 0);
    front.position.set(-((t * (90 * storm + 18)) % 380), (24 * storm + 4) * Math.sin(t * 1.5), 0);
    front2.position.set(((t * (120 * storm + 20)) % 460), (30 * storm + 4) * Math.sin(t * 1.2 + 1), 0);
    rainG.visible = storm > 0.05;
    drops.forEach((d, i) => { d.position.set(-560 + hash(i) * 1120 + (t * 300) % 200, 960 - ((t * 1400 + hash(i + 9) * 1900) % 1900), 0); d.material.opacity = 0.45 * storm; });
    zoomer(root, 1.02 + 0.015 * lt, 0, -200);
  };
}, [0.3, 0.3]);

// 6) PANTAI: sekoci, rombongan, makhluk muncul dari semak
const tS = T('09_tamim_sekoci').start;
const tBeast = capStart('09_tamim_sekoci', 'Lalu muncul');
const tAsk = capStart('09_tamim_sekoci', 'Kami bertanya');
addScene(tS, T('10_jassasah').start, (s, g) => {
  const w = wall(); g.add(w);
  const root = new THREE.Group(); g.add(root);
  const sea = sil(waveStrip(14, 300, -360, 900), 0.7); root.add(sea);
  root.add(sil(splineGeo([[-200, -1000], [-120, -520], [100, -430], [400, -380], [700, -400], [700, -1000]])));
  const boats = [0, 1].map(i => { const b = new THREE.Group(); b.add(sil(splineGeo([[-90, 10], [-60, -26], [60, -26], [95, 12]]))); root.add(b); return b; });
  const beast = creature(); beast.position.set(380, -440, 0); root.add(beast);
  const bush = new THREE.Group(); bush.position.set(380, -420, 0); root.add(bush); // semak di depan makhluk
  for (let i = 0; i < 9; i++) bush.add(at(sil(ellGeo(90 + 40 * hash(i), 80 + 30 * hash(i + 3))), -150 + i * 40, 30 + 60 * hash(i + 7)));
  const crew = [];
  for (let i = 0; i < 6; i++) { const p = person(1.0 + 0.08 * hash(i + 2), { cloak: i % 2 === 1 }); root.add(p); crew.push(p); }
  const tLand = tS + 2.6;
  s.update = (t) => {
    const lt = t - tS;
    setWall(w, t, { cA: 0xe49a58, cB: 0x1a0905, light: [540, 1180], r: 1050 });
    sea.position.set((t * 18) % 300, 5 * Math.sin(t), 0);
    boats.forEach((b, i) => { const k = easeOut(clamp(lt / 2.6)); b.position.set(lerp(-760, -420 + i * 150, k), -470 + i * 30 + 5 * Math.sin(t * 2 + i), 0); });
    const rise = smooth(tBeast, tBeast + 1.6, t);
    beast.scale.setScalar(lerp(0.35, 1.05, rise)); beast.position.y = lerp(-560, -470, rise);
    swayHair(beast, t, 0.12 + 0.1 * rise);
    crew.forEach((p, i) => {
      const k = smooth(tLand + i * 0.25, tLand + 2.2 + i * 0.25, t);
      const back = smooth(tBeast + 0.4, tBeast + 1.4, t);
      const x = lerp(-440 + i * 30, -260 + i * 55, k) - 70 * back;
      p.position.set(x, -470 + i * 6 + (k > 0 && k < 1 ? Math.abs(Math.sin(t * 7 + i)) * 7 : 0), 0);
      p.rotation.z = 0.12 * back * (0.7 + 0.3 * hash(i));
      p.visible = k > 0;
    });
    zoomer(root, 1 + 0.02 * lt + 0.1 * smooth(tAsk, tAsk + 3, t), 100, -400);
  };
}, [0.3, 0.3]);

// 7) AL-JASSASAH bicara, biara di bukit
const tJ = T('10_jassasah').start;
const tGo = capStart('10_jassasah', 'Pergilah');
const tLong = capStart('10_jassasah', 'Dia sangat');
addScene(tJ, T('11_tamim_takutsetan').start, (s, g) => {
  const w = wall(); g.add(w);
  const root = new THREE.Group(); g.add(root);
  const hill = sil(splineGeo([[-700, -300], [-300, 200], [0, 470], [250, 520], [600, 300], [700, -300]]), 0.8); root.add(hill);
  const mon = monastery(0.5, 0.0); mon.position.set(180, 500, 0); root.add(mon);
  const beast = creature(); beast.position.set(0, -800, 0); beast.scale.setScalar(2.1); root.add(beast);
  const pointer = new THREE.Group(); pointer.position.set(60, -330, 0); root.add(pointer);
  pointer.add(sil(polyGeo([[-14, 0], [14, 0], [4, 520], [-4, 520]]), 1));
  const mist = []; for (let i = 0; i < 14; i++) { const m = glow(220, 80, 0xffd9a0, 0); root.add(m); mist.push(m); }
  s.update = (t) => {
    const lt = t - tJ;
    setWall(w, t, { cA: 0xd98f56, cB: 0x140805, light: [740, 1500], r: 1000 });
    swayHair(beast, t, 0.2, 0.9);
    beast.position.y = -800 + 10 * Math.sin(t * 0.9);
    const go = smooth(tGo, tGo + 1.1, t);
    pointer.scale.set(1, go, 1); pointer.rotation.z = -0.32 + 0.02 * nz(t, 8);
    mon.userData.win.material.opacity = 0.9 * go * flick(t);
    mist.forEach((m, i) => { const k = (lt * 0.15 + hash(i)) % 1; m.position.set(-400 + hash(i + 3) * 800 + k * 120, -200 + hash(i + 6) * 200 + k * 60, 0); m.material.opacity = 0.12 * Math.sin(k * Math.PI); });
    zoomer(root, 1 + 0.02 * lt, 0, -200);
    root.position.y += -260 * smooth(tLong, tLong + 2.5, t); // kamera naik ke biara
  };
}, [0.3, 0.2]);

// 8) Rombongan bergegas mendaki ke biara
const tR = T('11_tamim_takutsetan').start;
const tHurry = capStart('11_tamim_takutsetan', 'Kami bergegas');
addScene(tR, T('11_tamim_takutsetan').end + 0.25, (s, g) => {
  const w = wall(); g.add(w);
  const root = new THREE.Group(); g.add(root);
  root.add(sil(polyGeo([[-900, -1100], [-900, -560], [900, 380], [900, -1100]]), 1));
  const mon = monastery(0.7, 0.85); mon.position.set(330, 330, 0); root.add(mon);
  const crew = []; for (let i = 0; i < 6; i++) { const p = person(0.95, { cloak: i % 2 === 0 }); root.add(p); crew.push(p); }
  const look = new THREE.Group(); root.add(look);
  const beast = creature(); beast.scale.setScalar(0.45); beast.position.set(-430, -700, 0); root.add(beast);
  s.update = (t) => {
    setWall(w, t, { cA: 0xd5874e, cB: 0x120704, light: [870, 1500], r: 950 });
    swayHair(beast, t, 0.18);
    const hurry = smooth(tHurry - 0.3, tHurry + 0.4, t);
    crew.forEach((p, i) => {
      const prog = clamp((t - tR) * (0.05 + 0.1 * hurry) + i * 0.05);
      const x = lerp(-260, 230, prog) - i * 70;
      const y = -560 + (x + 900) * (940 / 1800) + 2;
      p.position.set(x, y + Math.abs(Math.sin(t * (6 + 6 * hurry) + i)) * (6 + 6 * hurry), 0);
      p.rotation.z = -0.12 * hurry;
    });
    const lt = t - tR;
    zoomer(root, 1.08 + 0.02 * lt, 0, -200);
  };
}, [0.2, 0.15]);

// 9) Pintu biara terbuka: gelap, rantai, satu mata
const tD = T('11_tamim_takutsetan').end + 0.25;
addScene(tD, DUR, (s, g) => {
  const w = wall(); g.add(w);
  const root = new THREE.Group(); g.add(root);
  const frame = new THREE.Shape(); frame.moveTo(-540, -960); frame.lineTo(540, -960); frame.lineTo(540, 960); frame.lineTo(-540, 960); frame.lineTo(-540, -960);
  const hole = new THREE.Path(); hole.moveTo(-300, -700); hole.lineTo(-300, 200); hole.absarc(0, 200, 300, Math.PI, 0, true); hole.lineTo(300, -700); hole.lineTo(-300, -700); frame.holes.push(hole);
  const inside = mk(archGeo(600, 1200), 0x020101, 1); inside.position.set(0, -700, 0); root.add(inside);
  const eye = mk(ellGeo(26, 12), 0xffd27a, 0); eye.position.set(40, 120, 0); root.add(eye);
  const eyeGlow = glow(200, 130, 0xff7a2c, 0); eyeGlow.position.set(40, 120, 0); root.add(eyeGlow);
  const links = chainRow(9, 36, 0x8a6a48, 0, 22, 14); links.position.set(-150, -200, 0); links.rotation.z = 0.5; root.add(links);
  const doors = [-1, 1].map(sx => {
    const d = new THREE.Group(); d.position.set(sx * 300, -700, 0);
    const leaf = new THREE.Group(); d.add(leaf);
    const c = -sx * 300, sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(c, 0); sh.lineTo(c, 1200);
    sh.absarc(c, 900, 300, Math.PI / 2, sx < 0 ? Math.PI : 0, sx > 0); sh.lineTo(0, 0);
    leaf.add(mk(new THREE.ShapeGeometry(sh, 16), 0x2a170c, 1));
    for (let i = 1; i < 4; i++) leaf.add(at(mk(rectGeo(8, 900), 0x140a05, 1), -sx * i * 75, 450));
    root.add(d); return d;
  });
  root.add(sil(new THREE.ShapeGeometry(frame, 16), 0.9));
  const tOpen = tD + 0.2;
  s.update = (t) => {
    setWall(w, t, { cA: 0x9a4a22, cB: 0x070302, light: [540, 900], r: 900, bright: 0.8 });
    const open = smooth(tOpen, tOpen + 1.6, t);
    doors.forEach(d => d.scale.x = 1 - 0.88 * open);
    links.children.forEach(c => c.material.opacity = 0.8 * smooth(tOpen + 1.3, tOpen + 1.8, t));
    links.position.y = -200 + 6 * Math.sin(t * 2);
    const e = smooth(tOpen + 2.0, tOpen + 2.5, t);
    eye.material.opacity = e; eye.scale.y = 0.1 + 0.9 * e; eyeGlow.material.opacity = 0.5 * e * flick(t);
    zoomer(root, 1 + 0.06 * smooth(tOpen, DUR, t), 0, 100);
  };
}, [0.15, 0]);

// ---------- overlay teks ----------
const el = id => document.getElementById(id);
const ROLE_COLOR = { RAKA: '#ffb35a', NISA: '#ff9cc0', ABAH: '#b8e3a0', TAMIM: '#9cc8ff', DAJJAL: '#ff6a4d', 'AL-JASSASAH': '#d2a8ff' };
const pop = k => { k = clamp(k); return k < 1 ? 0.85 + 0.15 * easeOut(k) + 0.04 * Math.sin(k * Math.PI) : 1; };
function overlay(t) {
  // hook
  const hook = el('hook');
  if (t < T('02_narator_janji').start - 0.1) {
    hook.innerHTML = 'Seseorang pernah<br>bertemu <b>Dajjal</b>';
    const k = clamp((t - 0.1) / 0.25);
    hook.style.opacity = k * (1 - smooth(T('02_narator_janji').start - 0.4, T('02_narator_janji').start - 0.1, t));
    hook.style.transform = `scale(${pop(k)})`;
  } else hook.style.opacity = 0;
  // judul part
  const ti = el('title'), t0 = capStart('02_narator_janji', 'Dan Rasulullah'), t1 = scenes[1].end - 0.1;
  if (t > t0 && t < t1) { ti.innerHTML = 'Dajjal<small>Part 1 · Lelaki di Pulau</small>'; ti.style.opacity = smooth(t0, t0 + 0.4, t) * (1 - smooth(t1 - 0.4, t1, t)); }
  else ti.style.opacity = 0;
  // nama
  if (!(t >= tTamim && t < scenes[3].end)) el('name').style.opacity = 0;
  // caption
  const c = CAPS.find(c => t >= c.start - 0.05 && t < c.end + 0.25);
  const cap = el('cap'), role = el('role'), wrap = el('capwrap');
  if (c) {
    cap.textContent = c.text;
    const k = (t - c.start + 0.05) / 0.15;
    wrap.style.opacity = 1; cap.style.transform = `scale(${pop(k)})`;
    if (c.role !== 'NARATOR') { role.style.display = 'block'; role.textContent = c.role; role.style.background = ROLE_COLOR[c.role] || '#fff'; }
    else role.style.display = 'none';
  } else wrap.style.opacity = 0;
  // penutup
  const en = el('end'), te = tD + 2.2;
  en.textContent = 'Bersambung · Part 2';
  en.style.opacity = smooth(te, te + 0.4, t);
}

// ---------- seek ----------
const fadeM = mk(rectGeo(W, H), 0x000000, 0); scene.add(fadeM); fadeM.renderOrder = 1e6;
function seek(t) {
  let fade = 0;
  for (const s of scenes) {
    const on = t >= s.start && t < s.end;
    s.group.visible = on;
    if (on) {
      s.update(t);
      const [fi, fo] = s.fade;
      if (fi > 0) fade = Math.max(fade, 1 - (t - s.start) / fi);
      if (fo > 0) fade = Math.max(fade, 1 - (s.end - t) / fo);
    }
  }
  fadeM.material.opacity = clamp(fade);
  overlay(t);
  renderer.render(scene, cam);
}
window.__duration = DUR;
window.__fps = 30;
window.__seek = t => { seek(t); return true; };
await document.fonts.ready;
seek(+(params.get('t') || 0));
window.__ready = true;

if (params.has('play')) { // pratinjau langsung di browser, pakai VO
  const a = new Audio(`../vo_part${PART}.mp3`);
  document.body.addEventListener('click', () => { a.currentTime = 0; a.play(); const loop = () => { seek(a.currentTime); if (!a.paused) requestAnimationFrame(loop); }; loop(); }, { once: true });
}
