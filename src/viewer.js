import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { saveFile, loadFile, deleteFile } from './store.js';

const W = 8, D = 6, H = 4, RIDGE = 2.2;
const over = 0.35; // takutsprång på testhuset
const AZ = { N: Math.PI, E: Math.PI / 2, S: 0, W: -Math.PI / 2 };
const LABELS = { N: 'NORR', E: 'ÖST', S: 'SYD', W: 'VÄST', top: 'UPPIFRÅN' };
export const SLOTS = [
  ['N', 'Norr'], ['E', 'Öst'], ['S', 'Syd'], ['W', 'Väst'], ['top', 'Uppifrån (bild/film)'],
];
// Kameraparametrar: polar = vinkel från lodrätt
const HOUSE_PARAMS = { r: 16.5, polar: Math.atan2(15, 6.8), topR: 22, target: new THREE.Vector3(0, 2.2, 0), fogFar: 60 };
const MODEL_PARAMS = { r: 30, polar: 0.95, topR: 40, target: new THREE.Vector3(0, 2, 0), fogFar: 140 };
const MODEL_SIZE = 30; // modellens största mått i meter efter normalisering

const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const $ = id => document.getElementById(id);

const STATE_KEY = 'shh3d-state';
const state = Object.assign({ views: [], widgets: [], rotY: 0 }, JSON.parse(localStorage.getItem(STATE_KEY) || '{}'));
const persist = () => localStorage.setItem(STATE_KEY, JSON.stringify(state));

export async function initViewer() {
  const stage = $('stage');
  const swoosh = $('swoosh');
  const label = $('dir-label');

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050b14);
  scene.fog = new THREE.Fog(0x050b14, 25, 60);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
  scene.add(new THREE.HemisphereLight(0xdff2ff, 0x0a1220, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(6, 12, 8);
  scene.add(sun);

  const grid = new THREE.GridHelper(120, 120, 0x1de9ff, 0x0d3a52);
  grid.material.transparent = true;
  grid.material.opacity = 0.3;
  grid.position.y = -0.03;
  scene.add(grid);
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(9, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x0b1c2c, roughness: 1 }),
  );
  ground.position.y = -0.02;
  scene.add(ground);

  // ---- Testhus med foton ----
  const loader = new THREE.TextureLoader();
  const textures = {}, videos = {}, materials = {};

  const placeholder = (dir) => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 384;
    const g = c.getContext('2d');
    g.fillStyle = dir === 'top' ? '#5a3a34' : '#d9d2c3';
    g.fillRect(0, 0, 512, 384);
    if (dir === 'top') {
      g.strokeStyle = 'rgba(0,0,0,.25)';
      for (let y = 0; y < 384; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
    } else {
      [[70, 90], [330, 90], [200, 90]].forEach(([x, y], i) => {
        if (dir === 'S' && i === 2) return;
        g.fillStyle = '#26425c'; g.fillRect(x, y, 110, 120);
        g.fillStyle = '#7fd4ff'; g.fillRect(x + 6, y + 6, 98, 108);
      });
      if (dir === 'S') { g.fillStyle = '#5b3a24'; g.fillRect(215, 150, 80, 234); }
    }
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.font = 'bold 46px system-ui'; g.textAlign = 'center';
    g.fillText(dir === 'top' ? 'TAK' : LABELS[dir], 256, 60);
    return new THREE.CanvasTexture(c);
  };

  const makeMaterial = dir => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide });
    materials[dir] = m;
    setTexture(dir, placeholder(dir), 512 / 384);
    return m;
  };

  function setTexture(dir, tex, aspect) {
    textures[dir]?.dispose?.();
    textures[dir] = tex;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const target = dir === 'top' ? (W + 2 * over) / (D + 2 * over) : W / H;
    if (aspect > target) { tex.repeat.set(target / aspect, 1); tex.offset.set((1 - target / aspect) / 2, 0); }
    else { tex.repeat.set(1, aspect / target); tex.offset.set(0, (1 - aspect / target) / 2); }
    materials[dir].map = tex;
    materials[dir].needsUpdate = true;
  }

  async function applyFile(dir, blob) {
    if (videos[dir]) { videos[dir].pause(); delete videos[dir]; }
    const url = URL.createObjectURL(blob);
    if (blob.type.startsWith('video/')) {
      const v = Object.assign(document.createElement('video'), {
        src: url, loop: true, muted: true, playsInline: true, autoplay: true,
      });
      await new Promise(r => { v.onloadedmetadata = r; v.onerror = r; });
      await v.play().catch(() => {});
      videos[dir] = v;
      setTexture(dir, new THREE.VideoTexture(v), (v.videoWidth || 16) / (v.videoHeight || 9));
    } else {
      const tex = await loader.loadAsync(url);
      setTexture(dir, tex, tex.image.width / tex.image.height);
    }
  }

  const house = new THREE.Group();
  const walls = {
    N: [W, [0, H / 2, -D / 2], Math.PI],
    S: [W, [0, H / 2, D / 2], 0],
    E: [D, [W / 2, H / 2, 0], Math.PI / 2],
    W: [D, [-W / 2, H / 2, 0], -Math.PI / 2],
  };
  for (const [dir, [width, pos, ry]] of Object.entries(walls)) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, H), makeMaterial(dir));
    m.position.set(...pos); m.rotation.y = ry;
    house.add(m);
  }
  const quad = (a, b, c, d) => {
    const g = new THREE.BufferGeometry();
    const pts = [a, b, c, a, c, d];
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    const uvs = pts.flatMap(([x, , z]) => [(x + W / 2 + over) / (W + 2 * over), 1 - (z + D / 2 + over) / (D + 2 * over)]);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    return g;
  };
  const roofMat = makeMaterial('top');
  house.add(
    new THREE.Mesh(quad(
      [-W / 2 - over, H, -D / 2 - over], [W / 2 + over, H, -D / 2 - over],
      [W / 2 + over, H + RIDGE, 0], [-W / 2 - over, H + RIDGE, 0]), roofMat),
    new THREE.Mesh(quad(
      [W / 2 + over, H, D / 2 + over], [-W / 2 - over, H, D / 2 + over],
      [-W / 2 - over, H + RIDGE, 0], [W / 2 + over, H + RIDGE, 0]), roofMat),
  );
  const gableMat = new THREE.MeshStandardMaterial({ color: 0xcfc8ba, side: THREE.DoubleSide, roughness: 0.9 });
  for (const x of [-W / 2, W / 2]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([x, H, -D / 2, x, H, D / 2, x, H + RIDGE, 0], 3));
    g.computeVertexNormals();
    house.add(new THREE.Mesh(g, gableMat));
  }
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, D)),
    new THREE.LineBasicMaterial({ color: 0x1de9ff, transparent: true, opacity: 0.55 }));
  edges.position.y = H / 2;
  house.add(edges);
  scene.add(house);

  // ---- Uppladdad 3D-modell (hela tomten) ----
  let params = HOUSE_PARAMS;
  let modelRoot = null;
  const gltfLoader = new GLTFLoader()
    .setDRACOLoader(new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/'))
    .setMeshoptDecoder(MeshoptDecoder);

  function clearModel() {
    if (modelRoot) {
      scene.remove(modelRoot);
      modelRoot.traverse(o => { o.geometry?.dispose?.(); });
      modelRoot = null;
    }
    house.visible = ground.visible = true;
    params = HOUSE_PARAMS;
    scene.fog.far = params.fogFar;
    $('model-name').textContent = 'Ingen modell (visar testhus)';
    $('model-clear').hidden = true;
    $('model-tools').hidden = true;
  }

  async function setModel(blob, name) {
    const url = URL.createObjectURL(blob);
    let gltf;
    try { gltf = await gltfLoader.loadAsync(url); }
    catch (err) { alert('Kunde inte läsa modellen: ' + (err.message || err)); URL.revokeObjectURL(url); return false; }
    URL.revokeObjectURL(url);
    clearModel();
    const inner = gltf.scene;
    inner.traverse(o => { if (o.isMesh) { const ms = [].concat(o.material); ms.forEach(m => { m.side = THREE.DoubleSide; }); } });
    let box = new THREE.Box3().setFromObject(inner);
    const size = box.getSize(new THREE.Vector3());
    inner.scale.setScalar(MODEL_SIZE / Math.max(size.x, size.z, 1e-6));
    inner.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(inner);
    const ctr = box.getCenter(new THREE.Vector3());
    inner.position.set(-ctr.x, -box.min.y, -ctr.z);
    modelRoot = new THREE.Group();
    modelRoot.add(inner);
    modelRoot.rotation.y = THREE.MathUtils.degToRad(state.rotY);
    scene.add(modelRoot);
    house.visible = ground.visible = false;
    params = MODEL_PARAMS;
    scene.fog.far = params.fogFar;
    $('model-name').textContent = name || 'Modell';
    $('model-clear').hidden = false;
    $('model-tools').hidden = false;
    $('rot-range').value = state.rotY;
    // Hoppa till rätt avstånd för den nya modellen
    tween = null;
    const d = viewDest(current);
    Object.assign(cam, { az: d.az, polar: d.polar, r: d.r });
    cam.t.copy(d.t);
    return true;
  }

  // ---- Kamera ----
  const cam = { az: 0, polar: HOUSE_PARAMS.polar, r: HOUSE_PARAMS.r, t: HOUSE_PARAMS.target.clone() };
  let current = 'S';
  let tween = null;
  let lastInteract = 0;
  const customView = id => state.views.find(v => v.id === id);

  function viewDest(id) {
    const c = customView(id);
    if (c) return { az: c.az, polar: c.polar, r: c.r, t: new THREE.Vector3(...c.t) };
    if (id === 'top') return { az: cam.az, polar: 0.001, r: params.topR, t: params.target.clone() };
    return { az: AZ[id], polar: params.polar, r: params.r, t: params.target.clone() };
  }

  const place = (extraAz = 0) => {
    const a = cam.az + extraAz;
    camera.position.set(
      cam.t.x + cam.r * Math.sin(cam.polar) * Math.sin(a),
      cam.t.y + cam.r * Math.cos(cam.polar),
      cam.t.z + cam.r * Math.sin(cam.polar) * Math.cos(a));
    camera.lookAt(cam.t);
  };

  const viewLabel = id => customView(id)?.label?.toUpperCase() || LABELS[id] || '';

  function markActive() {
    document.querySelectorAll('#compass button').forEach(b => b.classList.toggle('active', b.dataset.dir === current));
    document.querySelectorAll('#views-bar button').forEach(b => b.classList.toggle('active', b.dataset.view === current));
    $('del-view').hidden = !customView(current);
    label.textContent = viewLabel(current);
    label.classList.remove('pop'); void label.offsetWidth; label.classList.add('pop');
  }

  function goTo(id) {
    if (id === current && !tween && !customView(id)) return;
    const d = viewDest(id);
    let delta = d.az - cam.az;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta)); // kortaste vägen
    tween = { from: { az: cam.az, polar: cam.polar, r: cam.r, t: cam.t.clone() }, to: d, delta, t0: performance.now(), dur: 1500 };
    current = id;
    markActive();
    renderWidgets();
    $('widgets').classList.add('away');
  }

  document.querySelectorAll('#compass button').forEach(b => b.addEventListener('click', () => goTo(b.dataset.dir)));
  const typing = () => document.activeElement?.matches?.('input,textarea,select') || $('card-dialog').open;
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && picking) { stopPicking(); return; }
    if (!$('view-house').classList.contains('active') || typing()) return;
    const k = { ArrowUp: 'N', ArrowRight: 'E', ArrowDown: 'S', ArrowLeft: 'W', ' ': 'top' }[e.key];
    if (k) { e.preventDefault(); goTo(k); }
  });

  // ---- Egna vyer ("sidor") ----
  function renderViewsBar() {
    const bar = $('views-bar');
    bar.innerHTML = '';
    for (const v of state.views) {
      const b = document.createElement('button');
      b.textContent = v.label; b.dataset.view = v.id;
      b.addEventListener('click', () => goTo(v.id));
      bar.appendChild(b);
    }
    markActive();
  }
  $('save-view').addEventListener('click', () => {
    const name = prompt('Namn på vyn (t.ex. Garage, Poolen, Altan)?')?.trim();
    if (!name) return;
    const v = { id: crypto.randomUUID(), label: name, az: cam.az, polar: cam.polar, r: cam.r, t: cam.t.toArray() };
    state.views.push(v); persist();
    current = v.id; renderViewsBar(); renderWidgets();
  });
  $('del-view').addEventListener('click', () => {
    const v = customView(current);
    if (!v || !confirm(`Ta bort vyn ${v.label} och dess kort?`)) return;
    state.views = state.views.filter(x => x !== v);
    state.widgets = state.widgets.filter(w => w.view !== v.id);
    persist(); renderViewsBar(); goTo('S');
  });

  // ---- Redigeringsläge ----
  let editing = false;
  $('edit-toggle').addEventListener('click', () => {
    editing = !editing;
    document.body.classList.toggle('editing', editing);
    $('edit-toggle').classList.toggle('on', editing);
    document.querySelector('.edit-tools').hidden = !editing;
    renderWidgets();
  });

  // ---- Kort (widgets) förankrade på modellen ----
  const wLayer = $('widgets'), wLines = $('wlines');
  const dlg = $('card-dialog'), form = $('card-form');
  let editingCard = null, cardIsNew = false, picking = null;
  const els = new Map();

  function renderWidgets() {
    wLayer.innerHTML = ''; wLines.innerHTML = ''; els.clear();
    const list = state.widgets.filter(w => w.view === current);
    list.forEach((w, i) => {
      const el = document.createElement('div');
      el.className = 'wcard';
      el.innerHTML = `<div class="wt"></div><div class="wv"><span class="wnum"></span><small></small></div><div class="wn"></div>`;
      el.querySelector('.wt').textContent = w.title;
      el.querySelector('.wnum').textContent = w.value;
      el.querySelector('small').textContent = w.unit || '';
      el.querySelector('.wn').textContent = w.note || '';
      wLayer.appendChild(el);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('r', 4);
      if (w.anchor) wLines.append(line, dot);
      if (!w.off) w.off = w.anchor ? [60, -80] : [20, 90 + i * 100];
      els.set(w.id, { el, line, dot, w });

      let drag = null;
      el.addEventListener('pointerdown', e => {
        if (!editing) return;
        e.stopPropagation();
        drag = { x: e.clientX, y: e.clientY, ox: w.off[0], oy: w.off[1], moved: false };
        el.setPointerCapture(e.pointerId);
      });
      el.addEventListener('pointermove', e => {
        if (!drag) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        w.off = [drag.ox + dx, drag.oy + dy];
      });
      el.addEventListener('pointerup', () => {
        if (!drag) return;
        if (drag.moved) persist(); else openCard(w, false);
        drag = null;
      });
    });
  }

  function updateWidgets() {
    const cw = stage.clientWidth, ch = stage.clientHeight;
    for (const { el, line, dot, w } of els.values()) {
      let x, y, show = true;
      if (w.anchor) {
        const p = new THREE.Vector3(...w.anchor).project(camera);
        const sx = (p.x * 0.5 + 0.5) * cw, sy = (-p.y * 0.5 + 0.5) * ch;
        show = p.z < 1;
        x = sx + w.off[0]; y = sy + w.off[1];
        const mw = el.offsetWidth, mh = el.offsetHeight;
        const ex = w.off[0] > 0 ? x : x + mw;
        line.setAttribute('x1', sx); line.setAttribute('y1', sy);
        line.setAttribute('x2', ex); line.setAttribute('y2', y + mh / 2);
        dot.setAttribute('cx', sx); dot.setAttribute('cy', sy);
        line.style.display = dot.style.display = show ? '' : 'none';
      } else { x = w.off[0]; y = w.off[1]; }
      el.style.transform = `translate(${x}px,${y}px)`;
      el.style.display = show ? '' : 'none';
    }
  }

  $('add-card').addEventListener('click', () => {
    const w = { id: crypto.randomUUID(), view: current, title: 'NYTT KORT', value: '', unit: '', note: '', anchor: null, off: null };
    state.widgets.push(w);
    renderWidgets();
    openCard(w, true);
  });

  function openCard(w, isNew) {
    editingCard = w; cardIsNew = isNew;
    form.title.value = w.title; form.value.value = w.value; form.unit.value = w.unit; form.note.value = w.note;
    $('card-pin').textContent = w.anchor ? '📍 Flytta på modellen' : '📍 Placera på modellen';
    $('card-unpin').hidden = !w.anchor;
    dlg.showModal();
  }
  $('card-cancel').addEventListener('click', () => dlg.close('cancel'));
  $('card-del').addEventListener('click', () => dlg.close('del'));
  $('card-pin').addEventListener('click', () => dlg.close('pin'));
  $('card-unpin').addEventListener('click', () => dlg.close('unpin'));
  dlg.addEventListener('close', () => {
    const w = editingCard; if (!w) return;
    const rv = dlg.returnValue;
    if (rv === 'ok' || rv === 'pin' || rv === 'unpin') {
      Object.assign(w, { title: form.title.value, value: form.value.value, unit: form.unit.value, note: form.note.value });
    }
    if (rv === 'del' || (rv === 'cancel' && cardIsNew) || (!rv && cardIsNew)) state.widgets = state.widgets.filter(x => x !== w);
    if (rv === 'unpin') { w.anchor = null; w.off = [20, 90]; }
    if (rv === 'pin') startPicking(w);
    persist(); renderWidgets();
    dlg.returnValue = '';
  });

  function startPicking(w) { picking = w; $('pick-hint').hidden = false; stage.style.cursor = 'crosshair'; }
  function stopPicking() { picking = null; $('pick-hint').hidden = true; stage.style.cursor = ''; }

  const ray = new THREE.Raycaster();
  function pick(e) {
    const r = stage.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const targets = modelRoot ? [modelRoot] : [house, ground];
    const hit = ray.intersectObjects(targets, true)[0];
    if (!hit) return;
    const w = picking;
    w.anchor = hit.point.toArray();
    w.off = [60, -80];
    persist(); stopPicking(); renderWidgets();
  }

  // ---- Fri kamera: dra = orbit, högerklick/Shift = panorera, scroll/nyp = zooma ----
  const pointers = new Map();
  let moved = 0, pinch0 = 0;
  stage.addEventListener('contextmenu', e => e.preventDefault());
  stage.addEventListener('pointerdown', e => {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  stage.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId);
    if (!p || tween) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    lastInteract = performance.now();
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0) cam.r = THREE.MathUtils.clamp(cam.r * (pinch0 / d), 3, 120);
      pinch0 = d;
    } else if (e.buttons & 2 || e.shiftKey) {
      const k = cam.r * 0.0016;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
      cam.t.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
    } else {
      cam.az -= dx * 0.006;
      cam.polar = THREE.MathUtils.clamp(cam.polar - dy * 0.006, 0.02, 1.52);
    }
  });
  const endPtr = e => {
    pointers.delete(e.pointerId);
    pinch0 = 0;
  };
  stage.addEventListener('pointerup', e => {
    const was = pointers.has(e.pointerId);
    endPtr(e);
    if (was && picking && moved < 6) pick(e);
  });
  stage.addEventListener('pointercancel', endPtr);
  stage.addEventListener('wheel', e => {
    e.preventDefault();
    if (tween) return;
    cam.r = THREE.MathUtils.clamp(cam.r * (e.deltaY > 0 ? 1.08 : 0.92), 3, 120);
    lastInteract = performance.now();
  }, { passive: false });

  function resize() {
    const { clientWidth: w, clientHeight: h } = stage;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = w / h < 1 ? 55 : 40;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    let sway = 0;
    if (tween) {
      const p = Math.min(1, (performance.now() - tween.t0) / tween.dur);
      const e = ease(p);
      const peak = Math.sin(Math.PI * p);
      const { from, to } = tween;
      cam.az = from.az + tween.delta * e;
      cam.polar = from.polar + (to.polar - from.polar) * e;
      cam.r = from.r + (to.r - from.r) * e + peak * (to.r * 0.25);
      cam.t.lerpVectors(from.t, to.t, e);
      stage.style.filter = `blur(${(peak * 14).toFixed(1)}px) saturate(${(1 + peak * 0.4).toFixed(2)})`;
      swoosh.style.opacity = (peak * 0.9).toFixed(2);
      swoosh.style.transform = `translateX(${(tween.delta >= 0 ? 1 : -1) * (0.5 - p) * 120}%)`;
      if (p >= 1) {
        stage.style.filter = '';
        swoosh.style.opacity = 0;
        tween = null;
        $('widgets').classList.remove('away');
      }
    } else if (current !== 'top' && performance.now() - lastInteract > 2500) {
      sway = Math.sin(clock.getElapsedTime() * 0.4) * 0.03;
    }
    place(sway);
    camera.updateMatrixWorld();
    updateWidgets();
    renderer.render(scene, camera);
  });
  resize();
  place();

  // ---- Uppladdning: modell ----
  $('model-file').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    if (await setModel(f, f.name)) { await saveFile('model', f); await saveFile('model-name', new Blob([f.name])); }
    e.target.value = '';
  });
  $('model-clear').addEventListener('click', async () => {
    clearModel(); await deleteFile('model'); await deleteFile('model-name');
  });
  const setRot = deg => {
    state.rotY = ((((deg + 180) % 360) + 360) % 360) - 180;
    if (modelRoot) modelRoot.rotation.y = THREE.MathUtils.degToRad(state.rotY);
    $('rot-range').value = state.rotY; persist();
  };
  $('rot-range').addEventListener('input', e => setRot(+e.target.value));
  $('rot-l').addEventListener('click', () => setRot(state.rotY - 90));
  $('rot-r').addEventListener('click', () => setRot(state.rotY + 90));

  const savedModel = await loadFile('model');
  if (savedModel) {
    const nm = await loadFile('model-name');
    await setModel(savedModel, nm ? await nm.text() : 'Modell');
  }

  // ---- Uppladdning: testhusets foton ----
  const slots = $('slots');
  for (const [dir, name] of SLOTS) {
    const tag = dir === 'top' ? '▲' : dir === 'E' ? 'Ö' : dir === 'W' ? 'V' : dir;
    const row = document.createElement('div');
    row.className = 'slot';
    row.innerHTML = `<span class="dirtag">${tag}</span>
      <span class="slot-name">${name}</span>
      <label class="btn small">Välj<input hidden type="file" accept="${dir === 'top' ? 'image/*,video/*' : 'image/*'}"></label>
      <button class="ghost small clear" hidden>✕</button>`;
    const input = row.querySelector('input');
    const clear = row.querySelector('.clear');
    input.addEventListener('change', async () => {
      const f = input.files[0];
      if (!f) return;
      await saveFile('house-' + dir, f);
      await applyFile(dir, f);
      clear.hidden = false;
      goTo(dir);
    });
    clear.addEventListener('click', async () => {
      await deleteFile('house-' + dir);
      if (videos[dir]) { videos[dir].pause(); delete videos[dir]; }
      setTexture(dir, placeholder(dir), 512 / 384);
      clear.hidden = true; input.value = '';
    });
    slots.appendChild(row);

    const saved = await loadFile('house-' + dir);
    if (saved) { await applyFile(dir, saved); clear.hidden = false; }
  }
  $('reset-house').addEventListener('click', () => {
    slots.querySelectorAll('.clear').forEach(b => !b.hidden && b.click());
  });
  const drawer = $('drawer');
  $('settings-btn').addEventListener('click', () => {
    if (!$('view-house').classList.contains('active')) document.querySelector('.tab[data-view="house"]').click();
    drawer.classList.toggle('open');
  });

  // Starta på Syd utan flygning
  const d0 = viewDest('S');
  Object.assign(cam, { az: d0.az, polar: d0.polar, r: d0.r }); cam.t.copy(d0.t);
  renderViewsBar();
  renderWidgets();
  return { resize };
}
