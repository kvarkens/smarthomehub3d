import { saveFile, loadFile, deleteFile } from './store.js';

const PRESETS = ['Källare', 'Våning 1', 'Våning 2', 'Vind'];
const KEY = 'shh3d-floors';

export async function initPlans() {
  let floors = JSON.parse(localStorage.getItem(KEY) || '[]'); // [{id,name}]
  let active = floors[0]?.id ?? null;
  const urls = {};

  const bar = document.getElementById('floor-bar');
  const img = document.getElementById('plan-img');
  const vp = document.getElementById('plan-viewport');
  const empty = document.getElementById('plan-empty');
  const title = document.getElementById('titleblock');
  const table = document.getElementById('table');
  const fileInput = document.getElementById('plan-file');
  const save = () => localStorage.setItem(KEY, JSON.stringify(floors));

  // Gör om en ritning (mörka linjer på ljust papper) till glödande cyan linjer på transparent botten
  async function neonize(blob) {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height);
    // Papperets ljushet = ungefär 90:e percentilen, så grå skanningar också blir rena
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.data.length; i += 4) hist[(d.data[i] * 0.3 + d.data[i + 1] * 0.59 + d.data[i + 2] * 0.11) | 0]++;
    let acc = 0, paper = 255;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > d.data.length / 4 * 0.1) { paper = v; break; } }
    for (let i = 0; i < d.data.length; i += 4) {
      const lum = d.data[i] * 0.3 + d.data[i + 1] * 0.59 + d.data[i + 2] * 0.11;
      const t = Math.min(1, Math.max(0, (1 - lum / Math.max(paper, 1) - 0.12) / 0.45));
      d.data[i] = 40; d.data[i + 1] = 235; d.data[i + 2] = 255;
      d.data[i + 3] = Math.round(t * t * (3 - 2 * t) * 255);
    }
    g.putImageData(d, 0, 0);
    return URL.createObjectURL(await new Promise(r => c.toBlob(r, 'image/png')));
  }

  for (const f of floors) {
    const b = await loadFile('plan-' + f.id);
    if (b) urls[f.id] = await neonize(b);
  }

  // Panorera och zooma
  let z = 1, px = 0, py = 0;
  const apply = () => { vp.style.transform = `translate(${px}px,${py}px) scale(${z})`; };
  const resetView = () => { z = 1; px = py = 0; apply(); };
  const zoomBy = k => { z = Math.min(6, Math.max(0.4, z * k)); apply(); };
  table.addEventListener('wheel', e => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.12 : 0.89); }, { passive: false });
  let drag = null;
  table.addEventListener('pointerdown', e => {
    if (e.target.closest('button,label,select')) return;
    drag = { x: e.clientX - px, y: e.clientY - py };
    table.setPointerCapture(e.pointerId);
  });
  table.addEventListener('pointermove', e => { if (drag) { px = e.clientX - drag.x; py = e.clientY - drag.y; apply(); } });
  table.addEventListener('pointerup', () => { drag = null; });
  document.getElementById('zin').onclick = () => zoomBy(1.25);
  document.getElementById('zout').onclick = () => zoomBy(0.8);
  document.getElementById('zreset').onclick = resetView;

  function render() {
    bar.innerHTML = '';
    for (const f of floors) {
      const b = document.createElement('button');
      b.className = 'floor' + (f.id === active ? ' active' : '');
      b.textContent = f.name;
      b.onclick = () => { active = f.id; render(); };
      bar.appendChild(b);
    }
    const add = document.createElement('select');
    add.className = 'floor-add';
    add.innerHTML = '<option value="">+ Lägg till våning</option>' +
      PRESETS.filter(p => !floors.some(f => f.name === p)).map(p => `<option>${p}</option>`).join('') +
      '<option value="__custom">Annat…</option>';
    add.onchange = () => {
      let name = add.value;
      if (name === '__custom') name = prompt('Namn på våningen?')?.trim();
      if (!name) { add.value = ''; return; }
      const f = { id: crypto.randomUUID(), name };
      floors.push(f); active = f.id; save(); render();
    };
    bar.appendChild(add);

    const cur = floors.find(f => f.id === active);
    if (cur && urls[cur.id]) {
      empty.hidden = true;
      img.classList.remove('in'); void img.offsetWidth;
      img.src = urls[cur.id];
      img.hidden = false;
      img.classList.add('in');
    } else {
      img.hidden = true;
      empty.hidden = false;
      empty.querySelector('p').textContent = cur ? `Ingen ritning för ${cur.name} ännu` : 'Lägg till en våning för att börja';
      empty.querySelector('label').hidden = !cur;
    }
    title.innerHTML = cur
      ? `<b>PLANRITNING</b><span>${cur.name.toUpperCase()}</span>
         <span class="tb-actions">${urls[cur.id] ? '<label class="link">Byt bild<input type="file" accept="image/*" hidden id="swap-file"></label>' : ''}
         <button class="link" id="del-floor">Ta bort våning</button></span>`
      : '';
    document.getElementById('swap-file')?.addEventListener('change', e => upload(e.target.files[0]));
    document.getElementById('del-floor')?.addEventListener('click', async () => {
      if (!confirm(`Ta bort ${cur.name}?`)) return;
      await deleteFile('plan-' + cur.id);
      delete urls[cur.id];
      floors = floors.filter(f => f.id !== cur.id);
      active = floors[0]?.id ?? null;
      save(); render();
    });
    resetView();
  }

  async function upload(file) {
    if (!file || !active) return;
    await saveFile('plan-' + active, file);
    urls[active] = await neonize(file);
    render();
  }
  fileInput.addEventListener('change', () => { upload(fileInput.files[0]); fileInput.value = ''; });

  render();
}
