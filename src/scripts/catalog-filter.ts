// CATÁLOGO V1 — filtro por categoría del catálogo de Sublimación.
//   <button data-filter="all|ropa|…" class="filter-pill">…</button>
//   <article data-category="ropa" class="product-card">…</article>
// Sin JS se ven todos los productos (los botones simplemente no hacen nada).
export function initCatalogFilter(): void {
  const pills = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-filter]'));
  const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-category]'));
  if (!pills.length || !cards.length) return;

  pills.forEach((pill) => {
    pill.addEventListener('click', () => {
      const f = pill.dataset.filter ?? 'all';
      pills.forEach((p) => {
        const on = p === pill;
        p.classList.toggle('is-active', on);
        p.setAttribute('aria-pressed', String(on));
      });
      let i = 0;
      cards.forEach((card) => {
        const show = f === 'all' || card.dataset.category === f;
        card.hidden = !show;
        card.classList.remove('is-filtered-in');
        if (show) {
          void card.offsetWidth;
          card.style.animationDelay = `${i++ * 60}ms`;
          card.classList.add('is-filtered-in');
        }
      });
    });
  });
}
