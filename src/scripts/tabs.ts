// BOLD V1 — pestañas accesibles para la página de Precios.
//   <section data-tabs> … <button data-tab="web"> … <div data-panel="web">
// Sin JS se ven todos los paneles. Con JS se muestra uno; el hash de la URL
// (#web, #seo…) abre directamente esa pestaña.
export function initTabs(): void {
  document.querySelectorAll<HTMLElement>('[data-tabs]').forEach((root) => {
    const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-tab]'));
    const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-panel]'));
    if (!tabs.length) return;

    const show = (id: string, focus = false) => {
      tabs.forEach((t) => {
        const on = t.dataset.tab === id;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        if (on) {
          if (focus) t.focus();
          t.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
        }
      });
      panels.forEach((p) => p.classList.toggle('is-active', p.dataset.panel === id));
    };

    tabs.forEach((t, i) => {
      t.addEventListener('click', () => {
        show(t.dataset.tab!);
        history.replaceState(null, '', `#${t.dataset.tab}`);
      });
      t.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
        show(next.dataset.tab!, true);
      });
    });

    const fromHash = window.location.hash.slice(1);
    root.classList.add('is-ready');
    show(tabs.some((t) => t.dataset.tab === fromHash) ? fromHash : tabs[0].dataset.tab!);
  });
}
