// Seri Dajjal, Part 2: Lelaki Berantai. Wayang bayangan 2D di Three.js.
// Util dan figur disalin dari part1/web/scene.js (Part 1 tidak diubah).
// Deterministik: window.__seek(t) menggambar frame di detik t (tanpa jam real-time).
import * as THREE from './lib/three.module.js';

const W = 1080, H = 1920;
const params = new URLSearchParams(location.search);
const PART = +(params.get('part') || 2);
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
  const collar = mk(rrectGeo(250, 46, 10), 0x5a4029, 1); collar.position.set(0, -55, 0); g.add(collar);
  const eyeL = mk(ellGeo(30, 16), 0xffd27a, 1); eyeL.position.set(70, 190, 0); g.add(eyeL); // mata kiri (sisi kanan penonton) yang melihat
  const eglow = glow(160, 110, 0xff8a3c, 0); eglow.position.set(70, 190, 0); g.add(eglow);
  const grape = mk(ellGeo(30, 30), 0x5d5a3f, 0.55); grape.position.set(-70, 192, 0); g.add(grape); // mata kanan buta, menonjol
  const cuffs = new THREE.Group();
  for (const sx of [-1, 1]) {
    const cuff = mk(rrectGeo(110, 60, 12), 0x5a4029, 1); cuff.position.set(sx * 150, -170, 0); cuffs.add(cuff);
  }
  g.add(cuffs);
  const chain = chainRow(14, 34, 0x6e5236, 1, 24, 15); chain.position.set(-230, -170, 0); g.add(chain);
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

// ---------- tambahan Part 2 ----------
const METAL = 0x7a5a3a;
function camAt(root, z, cx, cy) { root.scale.setScalar(z); root.position.set(-cx * z, -cy * z, 0); }
// kamera dari keyframe [t, z, cx, cy]; ulangi nilai yang sama untuk menahan
function camKeys(keys, t) {
  if (t <= keys[0][0]) return keys[0].slice(1);
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, ...a] = keys[i], [t1, ...b] = keys[i + 1];
    if (t < t1) { const k = smooth(t0, t1, t); return a.map((v, j) => lerp(v, b[j], k)); }
  }
  return keys.at(-1).slice(1);
}
function fadeGroup(grp, k) { // atur opacity seluruh isi grup, simpan opacity asli
  grp.visible = k > 0.001;
  grp.traverse(o => o.material && (o.material.opacity = (o.material.userData.o ??= o.material.opacity) * k));
}
const pulse = (t, t0, d = 0.5) => (t < t0 ? 0 : Math.exp(-(t - t0) / d * 3));

function giantBody() { // lelaki berantai seluruh badan: tangan terikat ke leher, kaki dirantai lutut sampai mata kaki
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    g.add(sil(polyGeo([[sx * 40, -250], [sx * 330, -250], [sx * 235, -1380], [sx * 70, -1380]]), 1));
    g.add(at(sil(ellGeo(135, 48), 1), sx * 160, -1395));
  }
  g.add(sil(splineGeo([[-470, 400], [-440, 0], [-360, -290], [0, -330], [360, -290], [440, 0], [470, 400], [0, 440]]), 1));
  for (const sx of [-1, 1]) { // lengan atas turun, lengan bawah naik ke leher
    g.add(sil(polyGeo([[sx * 360, 660], [sx * 560, 620], [sx * 630, 230], [sx * 470, 190]]), 1));
    g.add(sil(polyGeo([[sx * 630, 270], [sx * 500, 150], [sx * 100, 790], [sx * 210, 900]]), 1));
    g.add(at(sil(ellGeo(80, 70), 1), sx * 150, 845));
  }
  const head = giantHead(); head.position.set(0, 1000, 0); g.add(head);
  const links = new THREE.Group(); g.add(links); // rantai pergelangan ke kalung leher
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const l = chainLink(18, 11, 0x6e5236, 1); l.rotation.z = Math.PI / 2 + sx * 0.5; l.position.set(sx * (150 - i * 18), 870 + i * 30, 0); if (i % 2) l.scale.y = 0.45; links.add(l);
  }
  const rings = new THREE.Group(); g.add(rings); // belenggu lutut sampai mata kaki
  for (let i = 0; i < 9; i++) {
    const y = -780 - i * 66, rx = lerp(305, 225, i / 8);
    const r = mk(ringGeo(rx, 26, 0.32), METAL, 1); r.position.set(0, y, 0); r.userData.y = y; rings.add(r);
  }
  const hang = new THREE.Group(); g.add(hang); // rantai dari kaki ke lantai
  for (const sx of [-1, 1]) {
    const c = chainRow(9, 34, 0x6e5236, 1, 22, 14); c.rotation.z = -Math.PI / 2 + sx * 0.35; c.position.set(sx * 240, -1060, 0); hang.add(c);
  }
  g.userData = { head, links, rings, hang };
  return g;
}
function houseRow(x0, x1, y, seed) { // deretan rumah/kota datar dengan jendela menyala
  const g = new THREE.Group(), wins = [];
  let x = x0, i = 0;
  while (x < x1) {
    const w = 70 + 90 * hash(seed + i), h = 60 + 160 * hash(seed + i * 3.7);
    g.add(sil(rectGeo(w, h, x + w / 2, y + h / 2), 1));
    if (hash(seed + i * 5.1) > 0.75) g.add(sil(rectGeo(26, h + 90, x + w * 0.7, y + (h + 90) / 2), 1)); // menara
    x += w + 6; i++;
  }
  x = x0; i = 0;
  while (x < x1) {
    const w = 70 + 90 * hash(seed + i), h = 60 + 160 * hash(seed + i * 3.7);
    for (let k = 0; k < 2; k++) if (hash(seed + i * 9 + k) > 0.35) {
      const m = mk(rectGeo(12, 16), 0xffc070, 0.9); m.position.set(x + w * (0.3 + 0.4 * k), y + h * (0.45 + 0.25 * hash(i + k)), 0); m.userData.x = m.position.x; g.add(m); wins.push(m);
    }
    x += w + 6; i++;
  }
  g.userData.wins = wins;
  return g;
}
function kaaba(s = 1) {
  const g = new THREE.Group();
  g.add(sil(rectGeo(150, 160, 0, 80), 1));
  g.add(mk(rectGeo(150, 12, 0, 118), 0xd4a050, 0.85)); // sabuk kiswah
  g.scale.setScalar(s);
  return g;
}
function madinahMosque(s = 1, winOp = 0.5) {
  const g = new THREE.Group();
  g.add(sil(rectGeo(520, 210, 0, 105), 1));
  const fr = [[-280, 210]]; for (let i = 0; i <= 28; i++) fr.push([-280 + i * 20, 210 + (i % 2 ? 22 : 6)]); fr.push([280, 210]);
  g.add(sil(polyGeo(fr), 1));
  for (let i = 0; i < 4; i++) g.add(at(mk(archGeo(60, 130), 0xffb25a, winOp), -180 + i * 120, 0));
  g.scale.setScalar(s);
  return g;
}

// langgar dengan teplok menyala (dipakai dua kali)
function buildLanggar(g) {
  const root = new THREE.Group(); g.add(root);
  for (let i = 0; i < 13; i++) root.add(at(mk(rectGeo(86, 1300), i % 2 ? 0x4b3122 : 0x573a28), -540 + 43 + i * 86, 340));
  root.add(at(mk(rectGeo(1080, 20), 0x2c1c12), 0, -300));
  const winG = new THREE.Group(); winG.position.set(-250, 430, 0); root.add(winG);
  winG.add(mk(rectGeo(320, 420), 0x2a2216)); winG.add(mk(rectGeo(286, 386), 0x0d1420));
  const rain = []; for (let i = 0; i < 40; i++) { const r = mk(rectGeo(2.5, 36), 0x6f86a8, 0.55); winG.add(r); rain.push(r); }
  for (let i = -1; i <= 1; i++) winG.add(at(mk(rectGeo(12, 386), 0x2a2216), i * 72, 0));
  winG.add(mk(rectGeo(286, 12), 0x2a2216));
  root.add(at(mk(rectGeo(260, 16), 0x2c1c12), 270, 560));
  [0x5b1d1a, 0x1f3a2c, 0x5b1d1a, 0x3a2c1a, 0x1f3a2c, 0x5b1d1a].forEach((c, i) => root.add(at(mk(rectGeo(30, 90 + (i % 3) * 8), c), 175 + i * 36, 614 + (i % 3) * 4)));
  root.add(at(mk(rectGeo(230, 190), 0x2f2418), 270, 360));
  for (let i = 0; i < 5; i++) root.add(at(mk(rectGeo(170, 8), 0x8d7a5c, 0.6), 270, 420 - i * 30));
  const shadows = new THREE.Group(); root.add(shadows);
  root.add(at(mk(rectGeo(1080, 700), 0x5e1b1b), 0, -660));
  for (let i = 0; i < 6; i++) root.add(at(mk(rectGeo(1080, 6), 0x7a2c22, 0.7), 0, -340 - i * 90));
  const raka = seated({ body: 0x8e2f2a, legs: 0x2d3a4a, hair: 0x1b1410 }); at(raka, -300, -560, 0.95); root.add(raka);
  const phone = mk(rrectGeo(36, 62, 6), 0x9fd2ff, 1); phone.position.set(-250, -300, 0); root.add(phone);
  const phoneGlow = glow(170, 170, 0x5aa8ff, 0.18); phoneGlow.position.set(-262, -230, 0); root.add(phoneGlow);
  const nisa = seated({ body: 0x6c4f7d, legs: 0x6c4f7d, hijab: 0xb45f7a }); at(nisa, 60, -610, 0.74); root.add(nisa);
  const abah = seated({ body: 0xd5c6a6, legs: 0x5a3b2e, legStripe: 0x2c1a12, peci: true, beard: 0xd8d3c8, skin: 0xa8693f }); at(abah, 280, -560, 1.12); root.add(abah);
  for (const [c, sc] of [[raka, 1.5], [nisa, 1.5], [abah, 1.45]]) {
    const sh = new THREE.Group();
    sh.add(sil(splineGeo([[-95, 55], [-100, 160], [-85, 280], [-40, 312], [40, 312], [85, 280], [100, 160], [95, 55]]), 0.5));
    sh.add(at(sil(ellGeo(66, 76), 0.5), 0, 390));
    sh.userData.src = c; sh.userData.k = sc; shadows.add(sh);
  }
  const lampX = 70, lampY = -760;
  const lamp = new THREE.Group(); lamp.position.set(lampX, lampY, 0); root.add(lamp);
  lamp.add(mk(ellGeo(70, 22), 0x3a2a1a));
  lamp.add(at(mk(splineGeo([[-55, 0], [-60, 50], [-30, 90], [30, 90], [60, 50], [55, 0]]), 0x6b5536), 0, 10));
  lamp.add(at(mk(rrectGeo(56, 130, 24), 0xfff1d6, 0.28), 0, 160));
  const flame = mk(splineGeo([[0, 0], [14, 20], [8, 50], [0, 70], [-8, 50], [-14, 20]]), 0xffd27a, 1); flame.position.set(0, 120, 0); lamp.add(flame);
  const halo = glow(240, 240, 0xff9a3c, 0.3); halo.position.set(0, 160, 0); lamp.add(halo);
  const darkM = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: { uL: { value: new THREE.Vector2(540 + lampX, 960 + lampY + 160) }, uOn: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `varying vec2 vUv; uniform vec2 uL; uniform float uOn;
      void main(){ vec2 p = vUv * vec2(1080., 1920.); float d = length((p - uL) * vec2(1., .85)) / 1150.;
        float light = exp(-d*d*2.2) * uOn; float a = clamp(1. - light, 0., .97);
        gl_FragColor = vec4(.03, .015, .0, a); }`,
  });
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), darkM); dark.renderOrder = ORDER++; dark.frustumCulled = false; g.add(dark);
  const warm = mk(rectGeo(W, H), 0xff8a2a, 0.07, true); g.add(warm);
  return {
    root, raka, nisa, abah, phone, phoneGlow, lampX, lampY,
    update(t) {
      darkM.uniforms.uOn.value = flick(t);
      flame.scale.set(1 + 0.08 * nz(t * 9, 3), 1 + 0.15 * nz(t * 13, 4), 1);
      halo.material.opacity = 0.45 * flick(t);
      rain.forEach((r, i) => { r.position.set(-130 + hash(i) * 260, 190 - (((t * 600 + hash(i + 50) * 400) % 400)), 0); });
      shadows.children.forEach((sh) => {
        const c = sh.userData.src, k = sh.userData.k * (1 + 0.02 * nz(t * 6, 5));
        sh.position.set(lampX + (c.position.x - lampX) * k, 260 + (c.position.y - lampY) * 0.25, 0);
        sh.scale.setScalar(c.scale.x * k * 0.75);
      });
    },
  };
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
const capAll = sub => CAPS.filter(c => c.text.includes(sub)).map(c => c.start);

// waktu kunci (dari caption)
const tB2 = T('01_dajjal_hook').end + 0.4;
const tQ = T('13_dajjal_baisan').start;
const tNoFruit = capStart('15_dajjal_thabariyah', 'ia tidak');
const tLake = capStart('15_dajjal_thabariyah', 'Danau');
const tDry = T('17_dajjal_airhabis').start;
const tZ = T('18_narator_zughar').start;
const tMk = capStart('18_narator_zughar', 'Lalu tentang');
const tSelf = capStart('18_narator_zughar', 'Setelah itu');
const tMasih = T('19_dajjal_pengakuan').start;
const tOut = capStart('19_dajjal_pengakuan', 'Sebentar lagi');
const tLands = capStart('19_dajjal_pengakuan', 'Tidak ada');
const tExcept = capStart('19_dajjal_pengakuan', 'Kecuali');
const tMim = T('20_narator_thaibah').start;
const tKnocks = capAll('Inilah Thaibah').map(x => x - 0.4);
const tMadinah = capStart('20_narator_thaibah', 'Madinah.');
const tL1 = T('21_raka_gantung').start - 0.45;
const tPoint = T('22_narator_gantung').start;
const tThat = capStart('22_narator_gantung', 'Dan arah');
const tNotB = capStart('22_narator_gantung', 'bukan Bermuda');
const tEnd = T('22_narator_gantung').end;

// 1) HOOK: kepala lelaki berantai, mata membuka
addScene(0, tB2, (s, g) => {
  const w = wall(); g.add(w);
  const root = new THREE.Group(); g.add(root);
  const head = giantHead(); head.position.set(0, -260, 0); root.add(head);
  const fg = chainRow(40, 40, 0x0a0503, 1, 30, 19); fg.position.set(-820, -560, 0); fg.rotation.z = 0.22; root.add(fg);
  s.update = (t) => {
    setWall(w, t, { cA: 0xb4431c, cB: 0x070302, light: [540, 1050], r: 700, bright: 1.0, flash: 0.25 * pulse(t, 1.75, 0.6) });
    zoomer(root, 1 + 0.035 * t, 70, -70);
    const u = head.userData, open = smooth(0.5, 1.2, t);
    u.eyeL.scale.y = 0.08 + 0.92 * open;
    u.glow.material.opacity = 0.6 * open * flick(t);
    u.chain.position.y = -170 + 6 * Math.sin(t * 2.2) + 10 * pulse(t, 1.75, 0.5) * Math.sin(t * 40);
    fg.position.y = -560 + 10 * Math.sin(t * 1.7);
  };
}, [0, 0.3]);

// 2) DI DALAM BIARA: manusia paling besar, tangan ke leher, kaki dirantai
const tWide = capStart('12_narator_berantai', 'pernah');
const tBound = capStart('12_narator_berantai', 'Paling kuat');
const tNeck = capStart('12_narator_berantai', 'Kedua tangannya');
const tLegs = capStart('12_narator_berantai', 'Dari lutut');
addScene(tB2, tQ, (s, g) => {
  const w = wall(); g.add(w);
  const root = new THREE.Group(); g.add(root);
  root.add(sil(rectGeo(4000, 1400, 0, -2120), 1)); // lantai
  for (const x of [-980, 900]) root.add(sil(rectGeo(180, 5000, x, 0), 0.9)); // pilar batu
  const giant = giantBody(); giant.position.set(-60, 0, 0); root.add(giant);
  const crew = [];
  for (let i = 0; i < 5; i++) { const p = person(2.0 + 0.1 * hash(i + 4), { cloak: i % 2 === 0 }); p.position.set(470 + i * 92, -1420, 0); root.add(p); crew.push(p); }
  const keys = [[tB2, 1.0, 470, -1080], [tB2 + 0.9, 1.0, 470, -1080], [tWide + 0.6, 0.6, 30, -40], [tNeck - 0.1, 0.64, 0, 40],
    [tNeck + 1.1, 1.25, -60, 880], [tLegs - 0.1, 1.3, -60, 900], [tLegs + 1.5, 0.98, -60, -1020], [tQ, 1.03, -60, -1060]];
  s.update = (t) => {
    setWall(w, t, { cA: 0xb9582c, cB: 0x080302, light: [540, 1150], r: 1050, bright: 0.95 });
    const shake = smooth(tBound, tBound + 0.2, t) * (1 - smooth(tBound + 1.0, tBound + 1.8, t));
    const [z, cx, cy] = camKeys(keys, t);
    camAt(root, z, cx + 8 * shake * nz(t * 18, 7), cy + 8 * shake * nz(t * 18, 8));
    const u = giant.userData, hu = u.head.userData;
    hu.eyeL.scale.y = 1; hu.glow.material.opacity = 0.55 * flick(t);
    giant.scale.y = 1 + 0.004 * Math.sin(t * 1.3);
    const rattle = 0.4 + 2.5 * shake + 1.5 * smooth(tLegs, tLegs + 0.5, t) * (1 - smooth(tLegs + 2, tLegs + 3, t));
    u.rings.children.forEach((r, i) => { r.position.x = 5 * rattle * nz(t * 9 + i, 11); r.position.y = r.userData.y + 3 * rattle * nz(t * 11 + i, 12); });
    hu.chain.position.y = -170 + 3 * rattle * Math.sin(t * 9);
    u.hang.rotation.z = 0.02 * rattle * nz(t * 4, 13);
    crew.forEach((p, i) => { p.rotation.z = 0.06 + 0.04 * hash(i) + 0.08 * shake; p.position.y = -1420 + 4 * Math.abs(nz(t * 2 + i, 14)); });
  };
}, [0.3, 0.3]);

// 3) TANYA JAWAB: Baisan lalu Thabariyah sebagai penglihatan di dinding
addScene(tQ, tZ, (s, g) => {
  const w = wall(); g.add(w);
  const vis = new THREE.Group(); g.add(vis);
  // kebun kurma Baisan
  const grove = new THREE.Group(); vis.add(grove);
  grove.add(sil(splineGeo([[-900, -700], [-900, -170], [-300, -200], [200, -160], [900, -190], [900, -700]]), 1));
  const palms = [], dates = [];
  [[-390, 0.62, -0.06], [-180, 0.78, 0.05], [40, 0.7, -0.03], [250, 0.82, 0.08], [440, 0.6, -0.1]].forEach(([x, sc, ln], i) => {
    const p = palm(sc, ln); p.position.set(x, -200, 0); grove.add(p); palms.push(p);
    for (let k = 0; k < 3; k++) {
      const d = mk(ellGeo(26, 34), 0xd0702c, 0.95); d.position.set(-40 + k * 40, -40 - 10 * (k % 2), 0); d.userData.i = i * 3 + k;
      p.userData.top.add(d); dates.push(d);
    }
  });
  // danau Thabariyah
  const lake = new THREE.Group(); vis.add(lake);
  lake.add(sil(splineGeo([[-900, 40], [-500, 120], [-100, 70], [300, 130], [900, 60], [900, -40], [-900, -40]]), 0.85));
  const bed = mk(rectGeo(1800, 300, 0, -150), 0x3a2010, 1); lake.add(bed);
  const cracks = new THREE.Group(); lake.add(cracks);
  for (let i = 0; i < 22; i++) { const c = sil(rectGeo(4, 50 + 70 * hash(i + 30)), 1); c.position.set(-560 + 1120 * hash(i), -60 - 220 * hash(i + 7), 0); c.rotation.z = (hash(i + 3) - 0.5) * 2.6; cracks.add(c); }
  const water = mk(rectGeo(1800, 300, 0, -150), 0xffcf8f, 0.6); lake.add(water);
  const shine = glow(420, 60, 0xfff0c8, 0.5); shine.position.set(120, -80, 0); lake.add(shine);
  const ripples = sil(waveStrip(8, 140, -40, 40), 0.35); lake.add(ripples);
  lake.add(sil(splineGeo([[-900, -700], [-900, -220], [-600, -160], [-420, -330], [-900, -700]]), 1));
  lake.add(sil(splineGeo([[900, -700], [900, -200], [560, -180], [380, -330], [900, -700]]), 1));
  lake.add(sil(rectGeo(1800, 400, 0, -500), 1));
  // tokoh di bawah: kepala Dajjal (kiri), Tamim dan rombongan (kanan)
  const head = giantHead(); head.position.set(-330, -840, 0); head.scale.setScalar(0.62); g.add(head);
  const tamimG = glow(300, 420, 0xffc27a, 0); g.add(tamimG); tamimG.position.set(330, -720, 0);
  const crew = [person(1.6), person(1.7, { cloak: true })]; crew[0].position.set(500, -980, 0); crew[1].position.set(170, -990, 0); crew.forEach(p => g.add(p));
  const tamim = person(2.1, { cloak: true }); tamim.position.set(330, -975, 0); g.add(tamim);
  const speaking = (role, t) => data.lines.some(l => l.role === role && t >= l.start && t <= l.end);
  s.update = (t) => {
    const lt = t - tQ;
    const fruitGone = smooth(tNoFruit + 0.4, tNoFruit + 2.6, t);
    const dry = smooth(tDry + 0.4, tDry + 3.0, t);
    const toLake = smooth(tLake - 0.35, tLake + 0.35, t);
    const cA = new THREE.Color(0xe3a35e).lerp(new THREE.Color(0xa88a68), 0.6 * fruitGone * (1 - toLake) + 0.6 * dry * toLake).getHex();
    setWall(w, t, { cA, cB: 0x150904, light: [560, 800], r: 1000 });
    fadeGroup(grove, 1 - toLake); fadeGroup(lake, toLake);
    zoomer(vis, 1.02 + 0.012 * lt, 0, 0);
    palms.forEach((p, i) => { p.userData.top.rotation.z = 0.05 * nz(t * 0.7, i + 10) - 0.25 * fruitGone * (i % 2 ? 1 : -1); p.userData.top.scale.y = 1 - 0.3 * fruitGone; });
    dates.forEach(d => { const k = clamp((t - tNoFruit - 0.4 - 0.08 * (d.userData.i % 7)) / 1.4); d.position.y = -40 - 260 * k * k; d.material.opacity = 0.95 * (1 - k) * (1 - toLake); });
    water.scale.y = 1 - 0.93 * dry; water.position.y = -150 * (1 - water.scale.y) - 0;
    water.material.opacity = 0.6 * (1 - 0.8 * dry) * toLake;
    shine.material.opacity = 0.5 * (1 - dry) * toLake * flick(t + 2);
    ripples.position.x = (t * 30) % 140; ripples.material.opacity = 0.35 * (1 - dry) * toLake;
    cracks.children.forEach(c => c.material.opacity = smooth(0.5, 1, dry) * toLake);
    const dTalk = speaking('DAJJAL', t), tTalk = speaking('TAMIM', t);
    const hu = head.userData;
    hu.eyeL.scale.y = 1; hu.glow.material.opacity = (0.3 + (dTalk ? 0.35 + 0.15 * Math.abs(nz(t * 8, 3)) : 0)) * flick(t);
    head.position.y = -840 + 6 * Math.sin(t * 1.1) + (dTalk ? 4 * nz(t * 7, 5) : 0);
    tamimG.material.opacity = (tTalk ? 0.75 : 0.3) * flick(t + 5);
    tamim.position.y = -975 + (tTalk ? 5 * Math.abs(nz(t * 6, 6)) : 0);
  };
}, [0.3, 0.3]);

// 4) ZUGHAR lalu MAKKAH
addScene(tZ, tSelf, (s, g) => {
  const w = wall(); g.add(w);
  const spring = new THREE.Group(); g.add(spring);
  spring.add(sil(splineGeo([[-900, -700], [-900, -200], [-200, -230], [300, -180], [900, -210], [900, -700]]), 1));
  spring.add(sil(polyGeo([[-380, -230], [-350, -60], [-270, 40], [-230, 190], [-120, 150], [-60, 300], [20, 230], [90, 280], [160, 120], [250, 90], [300, -60], [340, -230]]), 1));
  spring.add(sil(polyGeo([[-520, -230], [-470, -120], [-400, -150], [-360, -230]]), 1));
  const pool = mk(ellGeo(230, 40), 0xffcf8f, 0.55); pool.position.set(-20, -250, 0); spring.add(pool);
  const drops = []; for (let i = 0; i < 12; i++) { const d = mk(ellGeo(7, 11), 0xffe2b0, 0.9); spring.add(d); drops.push(d); }
  const sp = [palm(0.55, 0.12), palm(0.45, -0.1)]; sp[0].position.set(-520, -230, 0); sp[1].position.set(480, -220, 0); sp.forEach(p => spring.add(p));
  for (let i = 0; i < 5; i++) spring.add(at(mk(rectGeo(700 - i * 90, 6), 0x3a2010, 0.9), 0, -330 - i * 45)); // ladang
  const mk_ = new THREE.Group(); g.add(mk_);
  mk_.add(sil(splineGeo([[-900, -700], [-900, 160], [-620, 260], [-420, 40], [-200, -60], [200, -60], [420, 60], [640, 300], [900, 140], [900, -700]]), 0.9));
  const beam = mk(polyGeo([[-60, -150], [60, -150], [260, 960], [-260, 960]]), 0xffe0a0, 0, true); mk_.add(beam);
  const kGlow = glow(380, 300, 0xffd9a0, 0); kGlow.position.set(0, -60, 0); mk_.add(kGlow);
  mk_.add(sil(rectGeo(1800, 500, 0, -390), 1));
  const kb = kaaba(0.9); kb.position.set(0, -140, 0); mk_.add(kb);
  s.update = (t) => {
    const lt = t - tZ;
    const toMk = smooth(tMk - 0.35, tMk + 0.35, t);
    setWall(w, t, { cA: toMk > 0.5 ? 0xe9b06a : 0xd99a5e, cB: 0x140804, light: [540, toMk > 0.5 ? 1000 : 1200], r: 1000 });
    fadeGroup(spring, 1 - toMk); fadeGroup(mk_, toMk);
    zoomer(spring, 1 + 0.02 * lt, 0, -150);
    drops.forEach((d, i) => { const k = ((t * 0.9 + i / drops.length) % 1); d.position.set(30 + 6 * Math.sin(i), 150 - 390 * k * k, 0); d.material.opacity = 0.9 * (1 - toMk) * (k < 0.95 ? 1 : 0); });
    pool.scale.set(1 + 0.02 * Math.sin(t * 3), 1, 1);
    const rise = smooth(tMk + 0.3, tMk + 3.2, t);
    beam.material.opacity = 0.16 * rise * toMk * flick(t);
    kGlow.material.opacity = 0.55 * rise * toMk * flick(t + 1);
    zoomer(mk_, 1 + 0.03 * Math.max(0, t - tMk), 0, -100);
  };
}, [0.3, 0.3]);

// 5) PENGAKUAN: "Aku adalah Al-Masih"
addScene(tSelf, tLands, (s, g) => {
  const w = wall(); g.add(w);
  const root = new THREE.Group(); g.add(root);
  const head = giantHead(); head.position.set(0, 20, 0); head.scale.setScalar(1.1); root.add(head);
  const fgL = chainRow(30, 40, 0x0a0503, 1, 30, 19); fgL.position.set(-820, -720, 0); fgL.rotation.z = 0.3; root.add(fgL);
  const fgR = chainRow(30, 40, 0x0a0503, 1, 30, 19); fgR.position.set(-300, 900, 0); fgR.rotation.z = -0.5; root.add(fgR);
  s.update = (t) => {
    const lt = t - tSelf;
    const hit = pulse(t, tMasih, 0.7), strain = smooth(tOut, tOut + 0.3, t);
    setWall(w, t, { cA: 0xb4431c, cB: 0x060201, light: [600, 900], r: 650 + 150 * strain, bright: 0.85 + 0.2 * strain, flash: 0.5 * hit });
    const z = 1 + 0.03 * lt + 0.22 * smooth(tMasih - 0.1, tMasih + 0.3, t);
    zoomer(root, z, 77, 229 + 20 * 1.1);
    const sh = 10 * hit + 7 * strain;
    root.position.x += sh * nz(t * 20, 2); root.position.y += sh * nz(t * 20, 3);
    const u = head.userData, open = smooth(tSelf + 0.6, tSelf + 1.6, t);
    u.eyeL.scale.y = 0.1 + 0.9 * open; u.glow.material.opacity = (0.45 + 0.4 * hit + 0.2 * strain) * open * flick(t);
    u.chain.position.y = -170 + (4 + 14 * strain) * Math.sin(t * (3 + 20 * strain));
    fgL.position.y = -720 + (8 + 20 * strain) * Math.sin(t * (1.7 + 12 * strain));
    fgR.position.y = 900 + (8 + 20 * strain) * Math.sin(t * (1.3 + 11 * strain) + 1);
  };
}, [0.4, 0.3]);

// 6) 40 MALAM: tiap negeri padam, kecuali Makkah dan Thaibah
addScene(tLands, tMim, (s, g) => {
  const w = wall(); g.add(w);
  const lands = new THREE.Group(); g.add(lands);
  const moon = mk(moonGeo(60, 0.5), 0xffe6b8, 0.9); moon.position.set(300, 560, 0); g.add(moon);
  const rows = [houseRow(-1600, 2600, -230, 3), houseRow(-1700, 2700, -420, 21)];
  rows[1].scale.setScalar(1.25); rows.forEach(r => lands.add(r));
  lands.add(sil(rectGeo(6000, 800, 500, -820), 1));
  const holy = new THREE.Group(); g.add(holy);
  holy.add(sil(splineGeo([[-900, -700], [-900, -200], [-300, -230], [300, -190], [900, -220], [900, -700]]), 1));
  const gM = glow(330, 330, 0xffd9a0, 0.6); gM.position.set(-250, -180, 0); holy.add(gM);
  const gT = glow(330, 330, 0xffd9a0, 0.6); gT.position.set(250, -180, 0); holy.add(gT);
  const kb = kaaba(0.75); kb.position.set(-250, -230, 0); holy.add(kb);
  const md = madinahMosque(0.45, 0.6); md.position.set(250, -230, 0); holy.add(md);
  const hp = palm(0.4, 0.1); hp.position.set(400, -230, 0); holy.add(hp);
  s.update = (t) => {
    const k = clamp((t - tLands) / (tExcept - tLands));
    const toHoly = smooth(tExcept - 0.3, tExcept + 0.5, t);
    setWall(w, t, { cA: 0x9a6a48, cB: 0x070302, light: [540, 1100], r: lerp(1000, 650, k), bright: lerp(0.95, 0.55, k) });
    lands.position.x = -1500 * k; lands.position.y = 0;
    fadeGroup(lands, 1 - toHoly); fadeGroup(holy, toHoly);
    const front = -900 + 4200 * k; // garis gelap menyapu kota
    for (const r of rows) for (const m of r.userData.wins) {
      const off = smooth(front - 150, front + 150, m.userData.x * r.scale.x + 0);
      m.material.opacity = 0.9 * off * (1 - toHoly) * (0.85 + 0.15 * flick(t + m.userData.x));
    }
    moon.geometry.dispose(); moon.geometry = moonGeo(60, Math.max(0.02, (0.5 + k * 1.35) % 1));
    moon.material.opacity = 0.9 * (1 - toHoly);
    const hk = smooth(tExcept, tExcept + 1.5, t);
    gM.material.opacity = gT.material.opacity = (0.35 + 0.35 * hk) * toHoly * flick(t);
    zoomer(holy, 1 + 0.03 * Math.max(0, t - tExcept), 0, -200);
  };
}, [0.3, 0.3]);

// 7) MIMBAR: tiga ketukan, "Inilah Thaibah", lalu Madinah
addScene(tMim, tL1, (s, g) => {
  const w = wall(); g.add(w);
  const inn = new THREE.Group(); g.add(inn);
  for (const x of [-430, 230, 470]) inn.add(sil(rectGeo(46, 2000, x, 0), 0.9)); // tiang batang kurma
  const fr = [[-700, 760]]; for (let i = 0; i <= 70; i++) fr.push([-700 + i * 20, 760 + (i % 2 ? -26 : -6)]); fr.push([700, 760], [700, 1100], [-700, 1100]);
  inn.add(sil(polyGeo(fr), 1)); // atap pelepah
  const beam = mk(polyGeo([[-130, 960], [130, 960], [260, -260], [-260, -260]]), 0xffd08a, 0.22, true); beam.position.set(-120, 0, 0); inn.add(beam);
  const mimbar = new THREE.Group(); mimbar.position.set(-120, -300, 0); inn.add(mimbar);
  [[0, 0, 300, 60], [30, 60, 240, 60], [60, 120, 180, 60]].forEach(([x, y, ww, hh]) => mimbar.add(sil(rectGeo(ww, hh, x + ww / 2 - 150, y + hh / 2))));
  mimbar.add(sil(rectGeo(110, 200, 90, 280)));
  mimbar.add(sil(polyGeo([[30, 380], [150, 380], [90, 460]])));
  mimbar.add(sil(polyGeo([[-150, 60], [-140, 80], [60, 260], [60, 230]])));
  const mimbarGlow = glow(380, 420, 0xffcc80, 0.35); mimbarGlow.position.set(-60, -40, 0); inn.add(mimbarGlow);
  const knockGlow = glow(300, 300, 0xfff0c8, 0); knockGlow.position.set(-30, -60, 0); inn.add(knockGlow);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) { const p = seatedBack(1.25 + r * 0.25); p.position.set(-470 + i * 190 + (r % 2) * 90, -560 - r * 150, 0); inn.add(p); }
  const out = new THREE.Group(); g.add(out);
  out.add(sil(rectGeo(2000, 700, 0, -720), 1));
  const md = madinahMosque(1.15, 0.45); md.position.set(-60, -370, 0); out.add(md);
  [[-470, 1.0, -0.1], [380, 0.85, 0.08], [520, 0.7, 0.04]].forEach(([x, sc, ln]) => { const p = palm(sc, ln); p.position.set(x, -380, 0); out.add(p); });
  const dawn = glow(700, 420, 0xffc070, 0.5); dawn.position.set(0, -340, 0); out.add(dawn);
  s.update = (t) => {
    const lt = t - tMim;
    const toOut = smooth(tMadinah - 0.5, tMadinah + 0.2, t);
    let kn = 0; for (const k of tKnocks) kn = Math.max(kn, pulse(t, k, 0.6));
    setWall(w, t, { cA: toOut > 0.5 ? 0xf0b66e : 0xeaa863, cB: 0x1a0c05, light: [540, 1150], r: 1050, flash: 0.22 * kn });
    fadeGroup(inn, 1 - toOut); fadeGroup(out, toOut);
    const bump = tKnocks.filter(k => t > k).length * 0.06;
    zoomer(inn, 1 + 0.012 * lt + bump, -60, -100);
    inn.position.y += -6 * kn;
    beam.material.opacity = 0.22 * (1 - toOut) * flick(t);
    mimbarGlow.material.opacity = (0.35 + 0.45 * kn) * (1 - toOut) * flick(t + 3);
    knockGlow.material.opacity = 0.6 * kn * (1 - toOut);
    knockGlow.scale.setScalar(1 + 1.5 * (1 - kn));
    zoomer(out, 1 + 0.02 * Math.max(0, t - tMadinah), 0, -300);
    dawn.material.opacity = 0.5 * toOut * flick(t);
  };
}, [0.3, 0.35]);

// 8) LANGGAR: Raka bertanya, "Bermuda?"
addScene(tL1, tPoint, (s, g) => {
  const L = buildLanggar(g);
  s.update = (t) => {
    L.update(t);
    animTalk(L.raka, t, t >= T('21_raka_gantung').start && t <= T('21_raka_gantung').end, 1);
    animTalk(L.nisa, t, false, 2); animTalk(L.abah, t, false, 3);
    const up = smooth(T('21_raka_gantung').start, T('21_raka_gantung').start + 0.5, t);
    L.raka.userData.armR.rotation.z = lerp(0.35, 2.9, up);
    L.phone.position.set(lerp(-250, -185, up), lerp(-300, -110, up), 0);
    L.phoneGlow.position.set(L.phone.position.x - 10, L.phone.position.y + 60, 0);
    L.abah.userData.head.rotation.z += 0.08 * smooth(capStart('21_raka_gantung', 'Bermuda?'), capStart('21_raka_gantung', 'Bermuda?') + 0.4, t);
    zoomer(L.root, 1.05 + 0.03 * (t - tL1), -200, -300);
  };
}, [0.35, 0.3]);

// 9) ARAH: cahaya dari Madinah menunjuk satu arah, menembus gelap
addScene(tPoint, tNotB - 0.15, (s, g) => {
  const w = wall(); g.add(w);
  const root = new THREE.Group(); g.add(root);
  root.add(sil(splineGeo([[-1000, -900], [-1000, -260], [0, -230], [1200, -280], [2400, -240], [3400, -270], [3400, -900]]), 1));
  root.add(sil(splineGeo([[400, -260], [900, -120], [1500, -60], [2200, -150], [3000, -100], [3400, -260]]), 0.6));
  const mdGlow = glow(420, 300, 0xffd9a0, 0.5); mdGlow.position.set(-300, -150, 0); root.add(mdGlow);
  const md = madinahMosque(0.7, 0.7); md.position.set(-300, -250, 0); root.add(md);
  [[-560, 0.6, -0.08], [-80, 0.5, 0.06]].forEach(([x, sc, ln]) => { const p = palm(sc, ln); p.position.set(x, -250, 0); root.add(p); });
  const beam = mk(polyGeo([[0, -14], [3000, -80], [3000, 80], [0, 14]]), 0xffc070, 0.45, true); beam.position.set(-300, -80, 0); root.add(beam);
  const beamCore = mk(polyGeo([[0, -4], [3000, -14], [3000, 14], [0, 4]]), 0xfff0c8, 0.6, true); beamCore.position.set(-300, -80, 0); root.add(beamCore);
  const tip = glow(160, 90, 0xfff0c8, 0); root.add(tip);
  const eye = mk(ellGeo(24, 11), 0xffd27a, 0); eye.position.set(2350, -150, 0); root.add(eye);
  const eyeGlow = glow(170, 110, 0xff7a2c, 0); eyeGlow.position.set(2350, -150, 0); root.add(eyeGlow);
  const keys = [[tPoint, 1.0, 0, 0], [tPoint + 1.0, 1.0, 0, 0], [tThat, 0.9, 1300, -120], [tNotB, 1.05, 2250, -140]];
  s.update = (t) => {
    const [z, cx, cy] = camKeys(keys, t); camAt(root, z, cx, cy);
    const lx = 540 + (-300 - cx) * z;
    setWall(w, t, { cA: 0xc0804c, cB: 0x050201, light: [Math.max(lx, 200 + 340 * smooth(tThat, tNotB, t)), 900], r: 1000, bright: 0.95 });
    const ext = smooth(tPoint + 0.8, tThat + 0.6, t);
    beam.scale.x = beamCore.scale.x = Math.max(0.001, ext); beam.material.opacity = 0.45 * flick(t); beamCore.material.opacity = 0.6 * flick(t + 4);
    tip.position.set(-300 + 3000 * ext * 0.86, -80, 0); tip.material.opacity = 0.5 * smooth(0, 0.1, ext) * flick(t + 2);
    mdGlow.material.opacity = 0.5 * flick(t + 1);
    const e = smooth(tThat + 0.8, tThat + 1.3, t);
    eye.material.opacity = e; eye.scale.y = 0.1 + 0.9 * e; eyeGlow.material.opacity = 0.6 * e * flick(t);
  };
}, [0.3, 0.15]);

// 10) LANGGAR, penutup
addScene(tNotB - 0.15, DUR, (s, g) => {
  const L = buildLanggar(g);
  s.update = (t) => {
    L.update(t);
    animTalk(L.raka, t, false, 1); animTalk(L.nisa, t, false, 2); animTalk(L.abah, t, false, 3);
    const down = smooth(tNotB + 0.3, tNotB + 1.0, t);
    L.raka.userData.armR.rotation.z = lerp(2.9, 0.35, down);
    L.phone.position.set(lerp(-185, -250, down), lerp(-110, -300, down), 0);
    L.phone.material.opacity = 1 - 0.85 * down; L.phoneGlow.material.opacity = 0.18 * (1 - down);
    L.phoneGlow.position.set(L.phone.position.x - 10, L.phone.position.y + 60, 0);
    L.nisa.position.x = lerp(60, 150, smooth(tNotB + 0.2, tNotB + 1.0, t));
    L.raka.userData.head.rotation.z += 0.1 * down;
    zoomer(L.root, 1.08 + 0.025 * (t - tNotB), -40, -300);
  };
}, [0.15, 0]);

// ---------- overlay teks ----------
const el = id => document.getElementById(id);
const ROLE_COLOR = { RAKA: '#ffb35a', NISA: '#ff9cc0', ABAH: '#b8e3a0', TAMIM: '#9cc8ff', DAJJAL: '#ff6a4d', 'AL-JASSASAH': '#d2a8ff' };
const pop = k => { k = clamp(k); return k < 1 ? 0.85 + 0.15 * easeOut(k) + 0.04 * Math.sin(k * Math.PI) : 1; };
const LABELS = [
  [tQ + 0.3, tLake - 0.3, () => 'KEBUN KURMA BAISAN'],
  [tLake + 0.2, tZ - 0.3, () => 'DANAU THABARIYAH'],
  [tZ + 0.3, tMk - 0.3, () => 'MATA AIR ZUGHAR'],
  [tMk + 0.2, tSelf - 0.3, () => 'MAKKAH'],
  [tLands + 0.2, tExcept - 0.25, t => `MALAM KE-${1 + Math.floor(39.999 * clamp((t - tLands - 0.2) / (tExcept - tLands - 0.6)))}`],
  [tExcept + 0.3, tMim - 0.3, () => 'MAKKAH  ·  THAIBAH'],
  [tMadinah, tL1 - 0.3, () => 'THAIBAH = MADINAH'],
];
function overlay(t) {
  const hook = el('hook');
  if (t < tB2) {
    hook.innerHTML = '<b>Dajjal</b> bicara<br>pada sahabat Nabi';
    const k = clamp((t - 0.1) / 0.25);
    hook.style.opacity = k * (1 - smooth(tB2 - 0.35, tB2 - 0.05, t));
    hook.style.transform = `scale(${pop(k)})`;
  } else hook.style.opacity = 0;
  const ti = el('title'), t0 = tB2 + 0.1, t1 = tWide + 0.6;
  if (t > t0 && t < t1) { ti.innerHTML = 'Dajjal<small>Part 2 · Lelaki Berantai</small>'; ti.style.opacity = smooth(t0, t0 + 0.4, t) * (1 - smooth(t1 - 0.4, t1, t)); }
  else ti.style.opacity = 0;
  const nm = el('name'), lb = LABELS.find(([a, b]) => t >= a && t < b);
  if (lb) { nm.textContent = lb[2](t); nm.style.top = '330px'; nm.style.opacity = smooth(lb[0], lb[0] + 0.3, t) * (1 - smooth(lb[1] - 0.3, lb[1], t)); }
  else nm.style.opacity = 0;
  const c = CAPS.find(c => t >= c.start - 0.05 && t < c.end + 0.25);
  const cap = el('cap'), role = el('role'), wrap = el('capwrap');
  if (c) {
    cap.textContent = c.text;
    const k = (t - c.start + 0.05) / 0.15;
    wrap.style.opacity = 1; cap.style.transform = `scale(${pop(k)})`;
    if (c.role !== 'NARATOR') { role.style.display = 'block'; role.textContent = c.role; role.style.background = ROLE_COLOR[c.role] || '#fff'; }
    else role.style.display = 'none';
  } else wrap.style.opacity = 0;
  const en = el('end'), te = tEnd + 0.2;
  en.textContent = 'Bersambung · Part 3';
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
window.__cuts = scenes.map(s => s.start);
await document.fonts.ready;
seek(+(params.get('t') || 0));
window.__ready = true;

if (params.has('play')) { // pratinjau langsung di browser, pakai VO
  const a = new Audio(`../../part1/vo_part${PART}.mp3`);
  document.body.addEventListener('click', () => { a.currentTime = 0; a.play(); const loop = () => { seek(a.currentTime); if (!a.paused) requestAnimationFrame(loop); }; loop(); }, { once: true });
}
