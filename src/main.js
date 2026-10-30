import { initViewer } from './viewer.js';
import { initPlans } from './plans.js';

async function main() {
  const viewer = await initViewer();
  await initPlans();

  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + t.dataset.view));
    if (t.dataset.view === 'house') requestAnimationFrame(viewer.resize);
  }));
}

main();
