// CATÁLOGO V1 — rellena el formulario de contacto cuando se llega desde un
// botón "Solicitar cotización" del catálogo:
//   /es/contacto/?servicio=sublimation&producto=Tazas#contact-form
// Solo usa valores que ya existen en el <select>; el producto se escribe en
// el mensaje con el prefijo que define el propio formulario (data-prefill).
export function initContactPrefill(): void {
  const params = new URLSearchParams(window.location.search);
  const servicio = params.get('servicio');
  const producto = params.get('producto');
  const select = document.getElementById('contact-servicio') as HTMLSelectElement | null;
  const msg = document.getElementById('contact-mensaje') as HTMLTextAreaElement | null;

  if (servicio && select && Array.from(select.options).some((o) => o.value === servicio)) {
    select.value = servicio;
  }
  if (producto && msg && !msg.value) {
    const prefix = msg.dataset.prefill ?? '';
    msg.value = `${prefix} ${producto.slice(0, 80)}. `.trimStart();
  }
}
