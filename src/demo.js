import * as THREE from 'three';

// ---------- Påhittade "foton" (byts mot dina riktiga bilder i appen) ----------
const NAMES = { N: 'NORR', E: 'ÖST', S: 'SYD', W: 'VÄST', top: 'UPPIFRÅN' };
const TINT = { N: '#c9b79c', E: '#a9bfd0', S: '#d8a58f', W: '#b4c79f' };
const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(42);

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

function windows(g, x0, y0, w, h, dir) {
  const cols = 3, ww = w * 0.16, wh = h * 0.3;
  for (let r = 0; r < 2; r++) for (let c = 0; c < cols; c++) {
    if (dir === 'S' && r === 1 && c === 1) continue;
    const x = x0 + w * (0.12 + c * 0.3), y = y0 + h * (0.12 + r * 0.45);
    g.fillStyle = '#f4efe6'; g.fillRect(x - 6, y - 6, ww + 12, wh + 12);
    const gr = g.createLinearGradient(x, y, x + ww, y + wh);
    gr.addColorStop(0, '#9fd2f0'); gr.addColorStop(1, '#3a6f96');
    g.fillStyle = gr; g.fillRect(x, y, ww, wh);
    g.fillStyle = '#f4efe6'; g.fillRect(x + ww / 2 - 2, y, 4, wh);
  }
  if (dir === 'S') { g.fillStyle = '#5b3a24'; g.fillRect(x0 + w * 0.42, y0 + h * 0.52, w * 0.16, h * 0.48); }
}

// Helbildsfoto med himmel, träd och hus (Foto-läge)
function scene(dir) {
  const [c, g] = canvas(1280, 800);
  const sky = g.createLinearGradient(0, 0, 0, 520);
  const skyCols = { N: ['#7f9cb8', '#d3dde6'], E: ['#f3b27a', '#fde6c5'], S: ['#4c8fd6', '#bfe0f7'], W: ['#e9876a', '#ffd9a8'] }[dir];
  sky.addColorStop(0, skyCols[0]); sky.addColorStop(1, skyCols[1]);
  g.fillStyle = sky; g.fillRect(0, 0, 1280, 800);
  g.fillStyle = '#5d7d4a'; g.fillRect(0, 560, 1280, 240);
  g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 560, 1280, 14);
  for (let i = 0; i < 9; i++) { // träd
    const x = rnd() * 1280, s = 70 + rnd() * 90;
    g.fillStyle = '#3f2f22'; g.fillRect(x - 6, 540 - s * 0.2, 12, s * 0.5);
    g.fillStyle = `hsl(${105 + rnd() * 25},38%,${24 + rnd() * 10}%)`;
    g.beginPath(); g.arc(x, 520 - s * 0.3, s * 0.55, 0, 7); g.fill();
  }
  // hus
  const hx = 250, hw = 780, hy = 290, hh = 270;
  g.fillStyle = TINT[dir]; g.fillRect(hx, hy, hw, hh);
  for (let y = hy; y < hy + hh; y += 14) { g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(hx, y, hw, 2); }
  g.fillStyle = '#4a2f2b'; g.beginPath(); g.moveTo(hx - 40, hy); g.lineTo(hx + hw / 2, hy - 130); g.lineTo(hx + hw + 40, hy); g.fill();
  windows(g, hx, hy, hw, hh, dir);
  g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '700 54px system-ui'; g.textAlign = 'center';
  g.fillText(NAMES[dir], 640, 120);
  return c.toDataURL('image/jpeg', 0.85);
}

// Bara fasaden, fyller hela bilden (används som textur i 3D-läge)
function facade(dir) {
  const [c, g] = canvas(1024, 512);
  g.fillStyle = TINT[dir]; g.fillRect(0, 0, 1024, 512);
  for (let y = 0; y < 512; y += 14) { g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(0, y, 1024, 2); }
  windows(g, 0, 0, 1024, 512, dir);
  g.fillStyle = 'rgba(0,0,0,.28)'; g.font = '700 60px system-ui'; g.textAlign = 'center';
  g.fillText(NAMES[dir], 512, 480);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function roofTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#5a3a34'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(0,0,0,.28)';
  for (let y = 0; y < 512; y += 20) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const DIRS = ['N', 'E', 'S', 'W', 'top'];
const photos = Object.fromEntries(['N', 'E', 'S', 'W'].map(d => [d, scene(d)]));
photos.top = photos.S;

// ---------- Gemensamt ----------
const label = document.getElementById('dir-label');
const hint = document.getElementById('hint');
const buttons = [...document.querySelectorAll('#compass button')];
const order = ['N', 'E', 'S', 'W'];
let mode = 'photo';
let current = 'S';

function setLabel(dir) {
  buttons.forEach(b => b.classList.toggle('active', b.dataset.dir === dir));
  label.textContent = NAMES[dir];
  label.classList.remove('pop'); void label.offsetWidth; label.classList.add('pop');
}

// ---------- 1 · FOTO-LÄGE ----------
const layers = [document.getElementById('la'), document.getElementById('lb')];
let front = 0, busy = false;
layers[0].style.backgroundImage = `url(${photos.S})`;
layers[1].style.opacity = 0;

function photoGo(dir) {
  if (busy || dir === current) return;
  // Riktning på svepet: åt vilket håll roterar vi?
  let step = 1;
  if (dir !== 'top' && current !== 'top') {
    const d = (order.indexOf(dir) - order.indexOf(current) + 4) % 4;
    step = d === 3 ? -1 : 1;
  }
  const out = layers[front], inn = layers[1 - front];
  inn.style.transition = out.style.transition = 'none';
  inn.style.backgroundImage = `url(${photos[dir]})`;
  inn.style.opacity = 0;
  inn.style.transform = `translateX(${step * 22}%) scale(1.15)`;
  inn.style.filter = 'blur(26px)';
  out.style.transform = 'none'; out.style.filter = 'none'; out.style.opacity = 1;
  void inn.offsetWidth;
  const t = 'transform 1.3s cubic-bezier(.65,0,.25,1), filter 1.3s cubic-bezier(.65,0,.25,1), opacity 1.3s ease-in-out';
  inn.style.transition = out.style.transition = t;
  out.style.transform = `translateX(${-step * 22}%) scale(1.15)`;
  out.style.filter = 'blur(26px)'; out.style.opacity = 0;
  inn.style.transform = 'none'; inn.style.filter = 'none'; inn.style.opacity = 1;
  inn.style.zIndex = 2; out.style.zIndex = 1;
  front = 1 - front; busy = true; current = dir; setLabel(dir);
  setTimeout(() => { busy = false; }, 1300);
}

// ---------- 2 · 3D-LÄGE med trepunktsblandning i hörnen ----------
const stage = document.getElementById('stage');
const swoosh = document.getElementById('swoosh');
const W = 8, H = 4, D = 6, RADIUS = 15, HEIGHT = 9;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);
const scene3 = new THREE.Scene();
scene3.background = new THREE.Color(0x050b14);
scene3.fog = new THREE.Fog(0x050b14, 25, 60);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
scene3.add(new THREE.HemisphereLight(0xbfe8ff, 0x0a1220, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(6, 12, 8); scene3.add(sun);
const grid = new THREE.GridHelper(60, 60, 0x1de9ff, 0x0d3a52);
grid.material.transparent = true; grid.material.opacity = 0.35; scene3.add(grid);

// Rundat hus: hörnen avrundas så att fotona kan tonas ihop mjukt över dem
const rb = new THREE.BoxGeometry(W, H, D, 48, 24, 36);
const R = 0.9, inner = new THREE.Vector3(W / 2 - R, H / 2 - R, D / 2 - R);
const p = rb.attributes.position, nrm = rb.attributes.normal, v = new THREE.Vector3(), c = new THREE.Vector3();
for (let i = 0; i < p.count; i++) {
  v.fromBufferAttribute(p, i);
  c.set(Math.sign(v.x) * Math.min(Math.abs(v.x), inner.x), Math.sign(v.y) * Math.min(Math.abs(v.y), inner.y), Math.sign(v.z) * Math.min(Math.abs(v.z), inner.z));
  v.sub(c); const n = v.clone().normalize();
  p.setXYZ(i, c.x + n.x * R, c.y + n.y * R, c.z + n.z * R);
  nrm.setXYZ(i, n.x, n.y, n.z);
}
const uniforms = {
  tN: { value: facade('N') }, tE: { value: facade('E') }, tS: { value: facade('S') }, tW: { value: facade('W') },
  sharp: { value: 6.0 }, size: { value: new THREE.Vector3(W, H, D) },
};
const bodyMat = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: `varying vec3 vP; varying vec3 vN;
    void main(){ vP = position; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tN,tE,tS,tW; uniform float sharp; uniform vec3 size; varying vec3 vP; varying vec3 vN;
    void main(){
      vec3 n = normalize(vN);
      // Varje vädersträck får en vikt efter hur mycket ytan pekar åt det hållet. Låg 'sharp' = bredare tonad övergång.
      float wS = pow(max( n.z,0.),sharp), wN = pow(max(-n.z,0.),sharp);
      float wE = pow(max( n.x,0.),sharp), wW = pow(max(-n.x,0.),sharp);
      float y = vP.y/size.y + .5;
      vec3 col = texture2D(tS, vec2( vP.x/size.x+.5, y)).rgb * wS
               + texture2D(tN, vec2(-vP.x/size.x+.5, y)).rgb * wN
               + texture2D(tE, vec2(-vP.z/size.z+.5, y)).rgb * wE
               + texture2D(tW, vec2( vP.z/size.z+.5, y)).rgb * wW;
      col /= (wS+wN+wE+wW+1e-4);
      float l = .62 + .38*max(dot(n, normalize(vec3(.4,.9,.5))),0.);
      gl_FragColor = vec4(pow(col*l, vec3(1.)), 1.);
      #include <colorspace_fragment>
    }`,
});
const body = new THREE.Mesh(rb, bodyMat); body.position.y = H / 2; scene3.add(body);

// Tak (sadeltak) med utsprång
const roofMat = new THREE.MeshStandardMaterial({ map: roofTexture(), roughness: .9, side: THREE.DoubleSide });
const over = .4, RIDGE = 2.2;
const q = (a, b, cc, d) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...cc, ...a, ...cc, ...d], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 4, 0, 4, 2, 0, 0, 4, 2, 0, 2], 2));
  g.computeVertexNormals(); return g;
};
roofMat.map.wrapS = roofMat.map.wrapT = THREE.RepeatWrapping;
scene3.add(
  new THREE.Mesh(q([-W / 2 - over, H, -D / 2 - over], [W / 2 + over, H, -D / 2 - over], [W / 2 + over, H + RIDGE, 0], [-W / 2 - over, H + RIDGE, 0]), roofMat),
  new THREE.Mesh(q([W / 2 + over, H, D / 2 + over], [-W / 2 - over, H, D / 2 + over], [-W / 2 - over, H + RIDGE, 0], [W / 2 + over, H + RIDGE, 0]), roofMat),
);

// Gavelspetsar (öst/väst), lite indragna så de inte krockar med den rundade kanten
const gableMat = new THREE.MeshStandardMaterial({ color: 0xd8d0c2, side: THREE.DoubleSide, roughness: .9 });
for (const x of [-W / 2 + .05, W / 2 - .05]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x, H - .1, -D / 2 + .1, x, H - .1, D / 2 - .1, x, H + RIDGE - .05, 0], 3));
  g.computeVertexNormals();
  scene3.add(new THREE.Mesh(g, gableMat));
}

// Kamera
const AZ = { N: Math.PI, E: Math.PI / 2, S: 0, W: -Math.PI / 2 };
const target = new THREE.Vector3(0, 2.2, 0);
const polarOf = d => (d === 'top' ? 0.001 : Math.atan2(RADIUS, HEIGHT - 2.2));
const rOf = d => (d === 'top' ? 22 : Math.hypot(RADIUS, HEIGHT - 2.2));
const cam = { az: 0, polar: polarOf('S'), r: rOf('S') };
let tween = null;
const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function placeCam(extra = 0) {
  const a = cam.az + extra;
  camera.position.set(target.x + cam.r * Math.sin(cam.polar) * Math.sin(a), target.y + cam.r * Math.cos(cam.polar), target.z + cam.r * Math.sin(cam.polar) * Math.cos(a));
  camera.lookAt(target);
}
function threeGo(dir) {
  if (dir === current && !tween) return;
  let delta = (AZ[dir] ?? cam.az) - cam.az; delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  tween = { from: { ...cam }, delta, polar: polarOf(dir), r: rOf(dir), t0: performance.now() };
  current = dir; setLabel(dir);
}
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h); camera.aspect = w / h; camera.fov = w / h < 1 ? 55 : 40; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  if (mode !== '3d') return;
  let sway = 0;
  if (tween) {
    const t = Math.min(1, (performance.now() - tween.t0) / 1500), e = ease(t), peak = Math.sin(Math.PI * t);
    cam.az = tween.from.az + tween.delta * e;
    cam.polar = tween.from.polar + (tween.polar - tween.from.polar) * e;
    cam.r = tween.from.r + (tween.r - tween.from.r) * e + peak * 4;
    stage.style.filter = `blur(${(peak * 14).toFixed(1)}px) saturate(${(1 + peak * .4).toFixed(2)})`;
    swoosh.style.opacity = (peak * .9).toFixed(2);
    swoosh.style.transform = `translateX(${(tween.delta >= 0 ? 1 : -1) * (.5 - t) * 120}%)`;
    if (t >= 1) { stage.style.filter = ''; swoosh.style.opacity = 0; tween = null; }
  } else if (current !== 'top') sway = Math.sin(clock.getElapsedTime() * .4) * .03;
  placeCam(sway);
  renderer.render(scene3, camera);
});

// ---------- Växla läge / navigering ----------
function setMode(m) {
  mode = m;
  document.body.classList.toggle('photo', m === 'photo');
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  hint.textContent = m === 'photo'
    ? 'Foton glider och tonas ihop med oskärpa. Perspektivet är fotots eget.'
    : 'Kameran flyger runt ett hus där fotona tonas ihop över de rundade hörnen.';
  if (m === '3d') {
    // hoppa direkt till samma väderstreck som fotoläget visade
    cam.az = AZ[current] ?? cam.az; cam.polar = polarOf(current); cam.r = rOf(current); tween = null;
    requestAnimationFrame(resize);
  }
}
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
buttons.forEach(b => b.addEventListener('click', () => (mode === 'photo' ? photoGo : threeGo)(b.dataset.dir)));
addEventListener('keydown', e => {
  const k = { ArrowUp: 'N', ArrowRight: 'E', ArrowDown: 'S', ArrowLeft: 'W', ' ': 'top' }[e.key];
  if (k) { e.preventDefault(); (mode === 'photo' ? photoGo : threeGo)(k); }
});
setMode('photo');
