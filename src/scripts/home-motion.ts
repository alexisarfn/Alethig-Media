// HOME MOTION V3 — rotadores del home (palabras del H1, vitrina de
// servicios del hero, pantallas de ejemplo de Páginas Web, chips de
// Sublimación). Markup:
//
//   <div class="rot-slides" data-rotator="showcase" data-interval="4500">
//     <div data-rotator-item class="is-active">…</div>
//     <div data-rotator-item>…</div>
//   </div>
//   <button data-rotator-tab="showcase">…</button>   ← opcional, en orden
//   <div data-rotator-follow="showcase">…items…</div> ← opcional, espejo
//
// - El primer item lleva .is-active en el HTML: sin JS se ve igual.
// - Se pausa con el mouse encima, con la pestaña oculta y fuera de pantalla.
// - Bajo prefers-reduced-motion los items cambian sin transición (CSS),
//   pero las palabras y pantallas siguen alternándose despacio: es
//   contenido, no decoración.

type Rotator = { show: (n: number) => void; items: HTMLElement[] };

function setActive(items: HTMLElement[], index: number): void {
  items.forEach((el, k) => {
    const on = k === index;
    el.classList.toggle('is-active', on);
    if (el.dataset.rotatorDecor === undefined) el.setAttribute('aria-hidden', on ? 'false' : 'true');
  });
}

function itemsOf(root: HTMLElement): HTMLElement[] {
  return Array.from(root.children).filter(
    (c): c is HTMLElement => c instanceof HTMLElement && c.hasAttribute('data-rotator-item'),
  );
}

export function initHomeMotion(): void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const registry = new Map<string, Rotator>();

  document.querySelectorAll<HTMLElement>('[data-rotator]').forEach((root) => {
    const name = root.dataset.rotator ?? '';
    const items = itemsOf(root);
    if (items.length < 2) return;

    const base = Number(root.dataset.interval) || 3500;
    const interval = reduced ? Math.max(base, 6000) : base;
    const tabs = name ? Array.from(document.querySelectorAll<HTMLElement>(`[data-rotator-tab="${name}"]`)) : [];
    const followers = name
      ? Array.from(document.querySelectorAll<HTMLElement>(`[data-rotator-follow="${name}"]`)).map(itemsOf)
      : [];

    let index = Math.max(0, items.findIndex((el) => el.classList.contains('is-active')));
    let timer: number | undefined;
    let hovered = false;
    let onScreen = true;

    const show = (n: number) => {
      index = (n + items.length) % items.length;
      setActive(items, index);
      followers.forEach((f) => f.length && setActive(f, index % f.length));
      tabs.forEach((tab, k) => {
        const on = k === index;
        tab.classList.toggle('is-active', on);
        tab.setAttribute('aria-pressed', String(on));
        // Reinicia la barra de progreso de la pestaña activa.
        const bar = tab.querySelector<HTMLElement>('.rot-tab-bar');
        if (bar && on) {
          bar.style.animation = 'none';
          void bar.offsetWidth;
          bar.style.animation = '';
        }
      });
    };

    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      stop();
      if (hovered || !onScreen || document.hidden) return;
      timer = window.setInterval(() => show(index + 1), interval);
    };

    root.style.setProperty('--rot-interval', `${interval}ms`);
    tabs.forEach((tab, k) => {
      tab.style.setProperty('--rot-interval', `${interval}ms`);
      tab.addEventListener('click', () => {
        show(k);
        start();
      });
    });

    if (root.dataset.pauseOnHover !== 'false') {
      root.addEventListener('mouseenter', () => { hovered = true; stop(); });
      root.addEventListener('mouseleave', () => { hovered = false; start(); });
    }
    document.addEventListener('visibilitychange', start);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        onScreen = entries.some((e) => e.isIntersecting);
        start();
      }).observe(root);
    }

    registry.set(name, { show, items });
    show(index);
    start();
  });
}
