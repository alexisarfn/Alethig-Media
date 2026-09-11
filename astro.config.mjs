import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

const SITE_URL = 'https://alethigmedia.com';

// Fase 5 — SEO internacional: pares ES↔EN por ruta (idénticos a los altHref
// hardcodeados en cada página /es/*.astro y /en/*.astro de la fase 4). Se
// usan para escribir <xhtml:link> de idiomas alternativos en el sitemap.
//
// No se usa la opción nativa `i18n` de @astrojs/sitemap: esa función empareja
// páginas comparando la ruta que queda IGUAL tras quitar el prefijo de
// idioma (ver node_modules/@astrojs/sitemap/dist/utils/parse-i18n-url.js) —
// funciona solo si ambas rutas comparten el mismo sufijo. Como este sitio usa
// slugs traducidos (contacto/contact, desarrollo-web/web-development, etc.),
// esa comparación fallaría para 9 de los 10 pares y dejaría casi todo el
// sitemap sin alternates. `serialize` de abajo construye los mismos
// <xhtml:link> a mano, con el emparejamiento real.
const LOCALE_PAIRS = [
  ['/es/', '/en/'],
  ['/es/contacto/', '/en/contact/'],
  ['/es/nosotros/', '/en/about/'],
  ['/es/alethig-media-os/', '/en/alethig-media-os/'],
  // POSITIONING PHASE 3 — página bespoke dedicada de Traffic & Growth.
  ['/es/trafico-y-crecimiento/', '/en/traffic-growth/'],
  // POSITIONING PHASE 4 — hub de Servicios de Apoyo (distinto de cada
  // detalle de servicio, que ya tiene su propio par más abajo).
  ['/es/servicios/', '/en/services/'],
  // POSITIONING PHASE 5 — página bespoke dedicada de Sublimación y
  // Productos con Marca (tercera línea de negocio primaria).
  ['/es/sublimacion/', '/en/sublimation/'],
  ['/es/servicios/desarrollo-web/', '/en/services/web-development/'],
  ['/es/servicios/diseno-de-marca/', '/en/services/brand-design/'],
  ['/es/servicios/manejo-de-redes-sociales/', '/en/services/social-media-management/'],
  ['/es/servicios/produccion-de-video/', '/en/services/video-production/'],
  ['/es/servicios/publicidad-pagada/', '/en/services/paid-advertising/'],
  // /es/gracias/ ↔ /en/thank-you/ se empareja en el <head> de cada página
  // (Layout.astro), no aquí: ambas son noindex y quedan fuera del sitemap
  // a propósito (ver el filter de abajo).
];
const PATH_TO_ALT = new Map([
  ...LOCALE_PAIRS,
  ...LOCALE_PAIRS.map(([es, en]) => [en, es]),
]);

export default defineConfig({
  site: 'https://alethigmedia.com',
  output: 'server',
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  // Fase 2 — bilingüe: URLs previas a /es/ redirigen permanentemente (301
  // en GET) a su equivalente en /es/. El destino incluye la barra final
  // para no depender de un segundo salto de normalización de Cloudflare.
  // "/" queda fuera de este mapa a propósito: su redirect es dinámico
  // (cookie/Accept-Language, ver src/pages/index.astro), no un destino fijo.
  redirects: {
    '/contacto': '/es/contacto/',
    '/nosotros': '/es/nosotros/',
    '/gracias': '/es/gracias/',
    '/alethig-media-os': '/es/alethig-media-os/',
    '/servicios/desarrollo-web': '/es/servicios/desarrollo-web/',
    '/servicios/diseno-de-marca': '/es/servicios/diseno-de-marca/',
    '/servicios/manejo-de-redes-sociales': '/es/servicios/manejo-de-redes-sociales/',
    '/servicios/produccion-de-video': '/es/servicios/produccion-de-video/',
    '/servicios/publicidad-pagada': '/es/servicios/publicidad-pagada/',
  },
  integrations: [
    sitemap({
      // /gracias (ES) y /thank-you (EN) son noindex (agradecimiento
      // post-formulario); /api/* no son páginas. Todas quedan fuera del
      // sitemap. Las rutas legacy (/contacto, /servicios/*, etc.) no
      // aparecen aquí: son redirects, no páginas, y el propio integration
      // solo recorre rutas de tipo "page".
      filter: (page) => !page.includes('/gracias') && !page.includes('/thank-you') && !page.includes('/api/'),
      // Alternates ES/EN reales por página (ver PATH_TO_ALT arriba).
      serialize(item) {
        const path = new URL(item.url).pathname;
        const altPath = PATH_TO_ALT.get(path);
        if (!altPath) return item;
        const lang = path.startsWith('/en/') ? 'en' : 'es';
        const altLang = lang === 'es' ? 'en' : 'es';
        item.links = [
          { lang, url: item.url },
          { lang: altLang, url: `${SITE_URL}${altPath}` },
          { lang: 'x-default', url: `${SITE_URL}/` },
        ];
        return item;
      },
    }),
  ],
});
