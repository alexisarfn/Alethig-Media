// BOLD V1 — efectos de cursor para todo el sitio (se llama desde Layout):
//   · Spotlight: .glass y .spot reciben --mx/--my → luz que sigue el cursor.
//   · Tilt 3D: .tilt se inclina según la posición del cursor.
// Solo con mouse/trackpad (pointer: fine) y sin reduced-motion.
export function initFx(): void {
  const fine = window.matchMedia('(pointer: fine)').matches;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!fine || reduced) return;

  document.querySelectorAll<HTMLElement>('.glass, .spot').forEach((el) => {
    el.classList.add('spot');
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });

  document.querySelectorAll<HTMLElement>('.tilt').forEach((el) => {
    const max = Number(el.dataset.tilt) || 7;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(900px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg) translateY(-4px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });
}
